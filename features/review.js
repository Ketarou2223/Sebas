// features/review.js
// 映画感想の「記録」「振り返り」「おすすめ判定」をひとつの機能に同居させる。
//   - 記録モード   : 「感想」で始まるメッセージ → Gemini で {title, comment} を抽出して保存
//   - 振り返りモード: 「感想一覧」「履歴」「観た映画」 → 保存済みの感想を一覧表示（Gemini は使わない）
//   - 判定モード    : 「おすすめ」「観るべき」「見るべき」を含む → 過去の感想から好みに合うか Gemini が判定
//
// ユーザーごとの保存は ctx.store（Upstash）。未設定なら保存は no-op・取得は空配列になる。

import { store } from '../lib/store.js';

/** 機能名。 */
export const name = 'review';

// 各モードのトリガー語
const LIST_TRIGGERS = ['感想一覧', '履歴', '観た映画'];
const RECOMMEND_TRIGGERS = ['おすすめ', '観るべき', '見るべき'];

/**
 * このメッセージがどのモードに該当するかを判定する。
 * 「感想一覧」は「感想」始まりでもあるため、必ず一覧判定を記録判定より先に行う。
 * @param {string} text
 * @returns {'list' | 'record' | 'recommend' | null}
 */
function modeOf(text) {
  if (LIST_TRIGGERS.some((t) => text.includes(t))) return 'list';
  if (text.startsWith('感想')) return 'record';
  if (RECOMMEND_TRIGGERS.some((t) => text.includes(t))) return 'recommend';
  return null;
}

/** いずれかのモードに該当すれば review が担当する。 */
export function match(text) {
  return modeOf(text) !== null;
}

/**
 * モードごとに分岐して処理する。
 * @param {object} event LINE の message イベント
 * @param {object} ctx 共通基盤（reply / gemini / store / butlerPrompt / userId）
 */
export async function handle(event, ctx) {
  const text = event.message?.text || '';
  const userId = ctx.userId || event.source?.userId;

  switch (modeOf(text)) {
    case 'record':
      return recordReview(text, userId, ctx);
    case 'list':
      return listReviews(userId, ctx);
    case 'recommend':
      return recommendFromReviews(text, userId, ctx);
    default:
      return;
  }
}

/**
 * 記録モード：本文から映画タイトルと感想を抽出して保存する。
 */
async function recordReview(text, userId, ctx) {
  // 先頭の「感想」とそれに続く区切り（空白・コロン・読点など）を取り除いた残りが本文
  const body = text.replace(/^感想[\s:：、。,.\-－—]*/u, '').trim();

  let title = '';
  let comment = body;

  const system = [
    'あなたはユーザーの文章から「映画のタイトル」と「感想」を抽出する抽出器です。',
    '出力は JSON オブジェクト {"title":"...","comment":"..."} のみとし、前置き・後置き・説明・コードブロック(```)は一切付けないこと。',
    'タイトルが文章中に明示されていない場合は title を空文字列 "" にすること。',
    'comment には感想の本文を入れること。',
  ].join('\n');

  try {
    const answer = await ctx.gemini.generateText(body, { system });
    const parsed = parseReviewJson(answer);
    if (parsed) {
      title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      comment =
        typeof parsed.comment === 'string' && parsed.comment.trim()
          ? parsed.comment.trim()
          : body;
    }
  } catch (err) {
    // Gemini 失敗時はフォールバック（本文全体を comment、title 不明として保存）
    console.error('[review] extract failed:', err);
  }

  await (ctx.store || store).addReview(userId, { title, comment });

  const titleLine = title ? `「${title}」` : 'こちらの作品';
  await ctx.reply([
    {
      type: 'text',
      text: `かしこまりました。${titleLine}のご感想、しかと記録いたしました。またのご鑑賞をお待ちしております。`,
    },
  ]);
}

/**
 * 振り返りモード：保存済みの感想を一覧で返す（Gemini は呼ばずトークンを節約）。
 */
async function listReviews(userId, ctx) {
  const reviews = await (ctx.store || store).getReviews(userId);

  if (!reviews.length) {
    await ctx.reply([
      {
        type: 'text',
        text: 'まだ感想の記録はございません。「感想 〇〇が面白かった」のようにお聞かせいただければ、私が控えておきます。',
      },
    ]);
    return;
  }

  const lines = reviews.map((r) => {
    const t = r.title && r.title.trim() ? r.title.trim() : 'タイトル不明';
    const c = (r.comment || '').trim() || '（感想なし）';
    return `・${t}：${c}`;
  });

  await ctx.reply([
    {
      type: 'text',
      text: `これまでにお預かりしたご感想でございます。\n\n${lines.join('\n')}`,
    },
  ]);
}

/**
 * 判定モード：過去の感想を踏まえて、問い合わせ作品が好みに合うか Gemini が判定する。
 */
async function recommendFromReviews(text, userId, ctx) {
  const reviews = await (ctx.store || store).getReviews(userId);

  if (!reviews.length) {
    await ctx.reply([
      {
        type: 'text',
        text: 'まだご主人様のお好みを存じ上げません。何作か感想をお聞かせいただければ、おすすめの判断ができるようになります。',
      },
    ]);
    return;
  }

  const list = reviews
    .map((r) => {
      const t = r.title && r.title.trim() ? r.title.trim() : 'タイトル不明';
      const c = (r.comment || '').trim();
      return `- ${t}：${c}`;
    })
    .join('\n');

  const prompt = [
    `これは主人の過去の映画感想です:\n${list}`,
    `主人の問い:'${text}'`,
    '主人の好みに合うか、執事 Sebas として日本語で簡潔に（2〜3文）判定し、理由を一言添えよ。',
  ].join('\n');

  try {
    const answer = await ctx.gemini.generateText(prompt, { system: ctx.butlerPrompt });
    const out =
      answer && answer.trim()
        ? answer.trim()
        : '申し訳ございません、ただいま判断いたしかねます。少し時間をおいて再度お尋ねくださいませ。';
    await ctx.reply([{ type: 'text', text: out }]);
  } catch (err) {
    console.error('[review] recommend failed:', err);
    await ctx.reply([
      {
        type: 'text',
        text: '申し訳ございません、ただいま判断いたしかねます。少し時間をおいて再度お尋ねくださいませ。',
      },
    ]);
  }
}

/**
 * Gemini の返答文字列から {title, comment} を取り出す。
 * 念のためコードブロック(```や```json)を剥がしてから JSON.parse する。
 * @param {string} answer
 * @returns {{ title?: string, comment?: string } | null}
 */
function parseReviewJson(answer) {
  if (!answer) return null;
  let s = answer.trim();

  // ```json ... ``` / ``` ... ``` のフェンスを除去
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 最初の { から最後の } までを切り出して JSON とみなす
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}
