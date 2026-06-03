// features/butler.js
// 自由文の執事雑談。Gemini に執事人格（persona.js の BUTLER_PROMPT）を渡し、
// どんな入力にも執事 Sebas として応対する“高機能フォールバック”。
//
// match は常に true なので、features/index.js では必ず最後に登録すること。
// これにより、他の機能（movie・review 等）がすべてハズれたときだけ呼ばれる。
//
// 会話メモリ（lib/memory.js）と連携する：
//   - 応答前に「長期メモ（人物像）」と「直近の会話バッファ」を文脈として Gemini に同梱する。
//   - 応答後に pushTurn でバッファを更新し、7往復たまっていれば要約を発火する。
// ただし“発露”は抑制的：メモを差し込むのは文脈としてのみで、出すか否かは persona.js の
// システムプロンプトに委ねる（普段はフラット、話題が関連したときだけ自然に触れる）。

import { getMemo, getBuffer, pushTurn, maybeSummarize } from '../lib/memory.js';
import { BACKSTORY } from '../lib/backstory.js';

/** 機能名。 */
export const name = 'butler';

// 他機能の案内も自然に添えてよい、という補足指示（元の usage 案内の役割を引き継ぐ）。
const GUIDE_NOTE = [
  '',
  'なお、必要に応じて以下のお手伝いができることも、会話の流れの中で自然にご案内して構いません（毎回案内する必要はありません）。',
  '・「今公開」などで公開中の映画一覧をお届け',
  '・「感想 〇〇が面白かった」でご鑑賞の感想を記録',
  '・「感想一覧」でこれまでの感想を振り返り',
  '・「〇〇はおすすめ？」でお好みに合うかを判定',
].join('\n');

/** 常に担当する（= 最後段のフォールバック）。 */
export function match() {
  return true;
}

/**
 * 執事人格で自由文に応答する。Gemini が空/失敗なら定型文でお詫びする。
 * @param {object} event LINE の message イベント
 * @param {object} ctx 共通基盤（reply / gemini / butlerPrompt / userId）
 */
export async function handle(event, ctx) {
  const text = event.message?.text || '';
  const userId = ctx.userId || event.source?.userId;

  // 記憶（長期メモ・直近バッファ）を文脈として読み込む。未設定なら空。
  const [memo, buffer] = await Promise.all([getMemo(userId), getBuffer(userId)]);

  const system = `${ctx.butlerPrompt}\n${GUIDE_NOTE}\n${backstoryContext()}\n${memoryContext(memo, buffer)}`;

  let answer = '';
  try {
    answer = await ctx.gemini.generateText(text, { system });
  } catch (err) {
    console.error('[butler] gemini failed:', err);
  }

  const out =
    answer && answer.trim()
      ? answer.trim()
      : '申し訳ございません、ただいま少々立て込んでおります。のちほど改めてお伺いいたします。';

  await ctx.reply([{ type: 'text', text: out }]);

  // 返信後にバッファを更新し、たまっていれば要約を発火（失敗してもユーザー応答には影響しない）。
  try {
    await pushTurn(userId, text, out);
    await maybeSummarize(userId, ctx.gemini);
  } catch (err) {
    console.error('[butler] memory update failed:', err);
  }
}

/**
 * 来歴をシステムプロンプト用ブロックに整形する。
 * persona.js の発露制御と必ずセットで渡す前提。Sebas が来歴を語り出さないよう注意書きを添える。
 * @returns {string}
 */
function backstoryContext() {
  return (
    '【あなた自身の来歴（背景設定）——自分からはほぼ語らないこと】\n' +
    '以下はあなたの人生の記録である。これはあなたの内側にある事実であり、問われても列挙・要約・説明しない。' +
    '会話の流れの中で、ごく自然に、ごく小さく、ふとした一行としてのみにじみ出ることがある。\n\n' +
    BACKSTORY
  );
}

/**
 * 長期メモと直近バッファを、Gemini に渡す”参考情報”ブロックに整形する。
 * どちらも空なら空文字（プロンプトを汚さない）。発露するか否かは persona 側のルールに委ねる。
 * @param {Array<object>} memo
 * @param {string[]} buffer
 * @returns {string}
 */
function memoryContext(memo, buffer) {
  const parts = [];
  if (Array.isArray(memo) && memo.length) {
    const lines = memo.map((m) => `・${m.topic}: ${m.summary}`).join('\n');
    parts.push(`【主人について把握していること（参考。必要なときだけ自然に触れる）】\n${lines}`);
  }
  if (Array.isArray(buffer) && buffer.length) {
    parts.push(`【直近の会話（参考）】\n${buffer.join('\n')}`);
  }
  return parts.join('\n\n');
}
