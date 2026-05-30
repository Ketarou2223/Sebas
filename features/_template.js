// features/_template.js
// 新しい機能を作るときのひな形。
// このファイルをコピーして features/<機能名>.js を作り、
// name / match / handle を埋めれば新機能になります。
//
// 仕上げに features/index.js の features 配列へ登録するのを忘れずに。
// （登録順に match されるため、より具体的なトリガーを持つ機能を上に置くと安全です）
//
// ※ファイル名が "_" 始まりのこのテンプレートは index.js に登録しないこと。

/** 機能名（ログやデバッグ用の識別子）。 */
export const name = 'template';

/**
 * このメッセージを自分が担当すべきか真偽で返す。
 * webhook はテキストメッセージのみを各機能に渡すので、text は文字列。
 * @param {string} text ユーザーが送ってきたテキスト
 * @returns {boolean}
 */
export function match(text) {
  // 例：特定キーワードを含むときだけ担当する
  return text.includes('テンプレート');
}

/**
 * 実処理。match が true を返したときに呼ばれる。
 * @param {object} event LINE の message イベント（event.message.text などが入る）
 * @param {object} ctx 共通基盤。以下が渡される：
 *   - reply(messages):   この相手へ返信する（messages は LINE メッセージ配列・最大5件）
 *   - gemini:            Gemini 連携（gemini.generateText(prompt, { system }) で文章生成）
 *   - store:             永続ストレージ（store.get/set/del。Upstash 未設定時は no-op）
 *   - butlerPrompt:      執事 Sebas のシステムプロンプト（gemini に system として渡す用）
 *   - event:            上記 event と同じものへの参照
 */
export async function handle(event, ctx) {
  // --- 単純に固定文を返す例 ---
  await ctx.reply([{ type: 'text', text: 'これはテンプレート機能の応答です。' }]);

  // --- Gemini で執事らしく返す例（必要なら上を消してこちらを使う） ---
  // const text = event.message.text || '';
  // const answer = await ctx.gemini.generateText(text, { system: ctx.butlerPrompt });
  // await ctx.reply([{ type: 'text', text: answer }]);

  // --- ストアを使う例（Upstash 設定時のみ実際に保存される） ---
  // await ctx.store.set(`last:${event.source?.userId}`, text, { ttlSeconds: 86400 });
}
