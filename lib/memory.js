// lib/memory.js
// 会話メモリの基盤。userId 単位で「短期バッファ」と「長期メモ」を管理する。
// 素の fetch で Upstash Redis REST を叩く（SDK 不使用。store.js と同じ流儀）。
//
//   - 短期バッファ conv:{userId} … 直近の生発話を RPUSH（"ご主人様: 〜" / "Sebas: 〜"）。
//                                  要約が走るとクリアされる、揮発的な作業領域。
//   - 長期メモ   memo:{userId} … 主人の人物像・関心事を JSON 配列で永続保存。
//                                 [{ topic, summary, recordedAt, updatedAt }]
//
// 設計の肝は「保持」と「発露」の分離：ここは保持だけを担う。発露（会話に出すか）は
// persona.js のシステムプロンプトと各 feature の文脈注入で制御する。
//
// Upstash 未設定時はすべて安全に no-op（バッファ空・メモ空配列・書き込みは何もしない）。

import { jstTodayString } from './tmdb.js';

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// バッファがこの往復数たまったら要約を実行する（1往復 = ユーザー発話 + 返信 = 2エントリ）。
export const TURN_THRESHOLD = 7;

/** ストア（Upstash）が利用可能か。 */
function enabled() {
  return Boolean(REST_URL && REST_TOKEN);
}

/**
 * Upstash REST へ1コマンド送る。未設定時は null（呼び出し側で no-op 扱い）。
 * @param {string[]} args Redis コマンドと引数の配列
 * @returns {Promise<any>}
 */
async function command(args) {
  if (!enabled()) return null;

  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upstash ${args[0]} failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.result;
}

/**
 * 1往復ぶんの発話を短期バッファに追記する（ユーザー発話 → 返信 の順で2エントリ）。
 * userId・ストア未設定なら no-op。
 * @param {string} userId LINE のユーザーID
 * @param {string} userText 主人の発話
 * @param {string} botText Sebas の返信
 */
export async function pushTurn(userId, userText, botText) {
  if (!userId || !enabled()) return;
  const u = (userText || '').trim();
  const b = (botText || '').trim();
  await command(['RPUSH', `conv:${userId}`, `ご主人様: ${u}`, `Sebas: ${b}`]);
}

/**
 * 短期バッファを古い順に全取得する（生ログの文字列配列）。
 * 未設定・未記録時は空配列。
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getBuffer(userId) {
  if (!userId || !enabled()) return [];
  const items = await command(['LRANGE', `conv:${userId}`, '0', '-1']);
  return Array.isArray(items) ? items : [];
}

/** 短期バッファを破棄する。 */
export async function clearBuffer(userId) {
  if (!userId || !enabled()) return;
  await command(['DEL', `conv:${userId}`]);
}

/**
 * 長期メモを取得する。JSON 配列をパースして返す。
 * 未設定・未記録・壊れた値のときは空配列。
 * @param {string} userId
 * @returns {Promise<Array<{topic:string, summary:string, recordedAt:string, updatedAt:string}>>}
 */
export async function getMemo(userId) {
  if (!userId || !enabled()) return [];
  const raw = await command(['GET', `memo:${userId}`]);
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

/**
 * 長期メモを保存する（配列を JSON 文字列化）。配列でなければ何もしない。
 * @param {string} userId
 * @param {Array<object>} items
 */
export async function setMemo(userId, items) {
  if (!userId || !enabled()) return;
  if (!Array.isArray(items)) return;
  await command(['SET', `memo:${userId}`, JSON.stringify(items)]);
}

/**
 * バッファが閾値（TURN_THRESHOLD 往復 = 2倍のエントリ数）に達していれば要約を実行する。
 * 既存の長期メモ＋短期バッファ＋今日の日付を Gemini に渡し、更新後のメモ JSON のみを得て
 * setMemo → clearBuffer する。閾値未満なら何もしない。
 *
 * parse 失敗・Gemini 失敗時は、メモもバッファも保持して次回に再試行する（情報を失わない）。
 *
 * @param {string} userId
 * @param {{ generateText: Function }} gemini ctx.gemini（lib/gemini.js）
 * @returns {Promise<boolean>} 要約を実行して更新できたら true
 */
export async function maybeSummarize(userId, gemini) {
  if (!userId || !enabled()) return false;

  const buffer = await getBuffer(userId);
  if (buffer.length < TURN_THRESHOLD * 2) return false;

  const memo = await getMemo(userId);
  const today = jstTodayString();

  const system = [
    'あなたは執事 Sebas の「記憶係」です。主人との会話ログを読み、主人の人物像・感情・継続的な関心事を項目で管理します。',
    '各項目は { "topic": 主題, "summary": 要点, "recordedAt": 初回記録日, "updatedAt": 最終更新日 } を持ちます。日付は "YYYY-MM-DD" 形式。',
    '更新ルール:',
    '・新規に判明した事柄は項目を追加し、recordedAt と updatedAt を今日にする。',
    '・既存項目に変化・進展があれば summary を書き換え、updatedAt を今日にする（recordedAt は維持）。',
    '・矛盾する情報は新しい方で上書きする。',
    '・項目数が15を超えそうなら、削除ではなく「統合」を優先する。特に同一対象（特定の人物・テーマ）の時系列の出来事は、期間と要点を残して1項目に畳む（例: 交際の開始〜別れまでの経緯を、期間を明記して1項目に要約する）。',
    '・重要度は項目ごとに異なる。単発で些末な事実は落としてよいが、人間関係・感情・進行中の関心事は優先的に残す。',
    '出力は更新後のメモ JSON 配列のみ。前置き・後置き・説明・コードブロック(```)は一切付けないこと。',
  ].join('\n');

  const prompt = [
    `今日の日付: ${today}`,
    '',
    '【現在の長期メモ(JSON)】',
    memo.length ? JSON.stringify(memo, null, 2) : '（まだ記録なし。空配列 [] から始めてよい）',
    '',
    '【今回の会話バッファ（古い順の生ログ）】',
    buffer.join('\n'),
    '',
    '上記を踏まえ、更新後のメモ JSON 配列のみを出力せよ。',
  ].join('\n');

  let answer = '';
  try {
    answer = await gemini.generateText(prompt, { system });
  } catch (err) {
    console.error('[memory] summarize gemini failed:', err);
    return false; // バッファ保持。次回再試行
  }

  const items = parseMemoJson(answer);
  if (!items) {
    console.error('[memory] summarize parse failed; keep buffer for retry');
    return false; // parse 失敗時は既存メモ・バッファを保持
  }

  await setMemo(userId, items);
  await clearBuffer(userId);
  return true;
}

/**
 * Gemini の返答文字列からメモ JSON 配列を取り出す。
 * コードブロックや前後の地の文が混じっても、最初の [ から最後の ] までを切り出して parse する。
 * @param {string} answer
 * @returns {Array<object> | null}
 */
export function parseMemoJson(answer) {
  if (!answer) return null;
  let s = answer.trim();

  // ```json ... ``` / ``` ... ``` のフェンスを除去
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 最初の [ から最後の ] までを配列とみなす
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
