// features/butler.js
// 自由文の執事雑談。Gemini に執事人格（persona.js の BUTLER_PROMPT）を渡し、
// どんな入力にも執事 Sebas として応対する“高機能フォールバック”。
//
// match は常に true なので、features/index.js では必ず最後に登録すること。
// これにより、他の機能（movie・review 等）がすべてハズれたときだけ呼ばれる。

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
  const system = `${ctx.butlerPrompt}\n${GUIDE_NOTE}`;

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
}
