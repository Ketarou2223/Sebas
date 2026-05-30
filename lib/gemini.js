// lib/gemini.js
// Gemini 連携は現状「雛形のみ」。cron / webhook の本体には組み込んでいません。
// 将来的に、あらすじ要約・レコメンド文の生成などに使う想定です。

/**
 * 未実装のスタブ。呼ぶとエラーになります（本体では未使用）。
 * @param {string} _prompt
 * @returns {Promise<string>}
 */
export async function generateText(_prompt) {
  throw new Error('gemini is not implemented yet (stub).');
}

/*
// ---------------------------------------------------------------------------
// 後で有効化するサンプル：gemini-2.0-flash を fetch で叩く（依存パッケージ不要）。
// 環境変数 GEMINI_API_KEY が必要。
//
// export async function generateTextSample(prompt) {
//   const apiKey = process.env.GEMINI_API_KEY;
//   if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
//
//   const url =
//     'https://generativelanguage.googleapis.com/v1beta/models/' +
//     'gemini-2.0-flash:generateContent?key=' + apiKey;
//
//   const res = await fetch(url, {
//     method: 'POST',
//     headers: { 'content-type': 'application/json' },
//     body: JSON.stringify({
//       contents: [{ parts: [{ text: prompt }] }],
//     }),
//   });
//   if (!res.ok) {
//     const text = await res.text().catch(() => '');
//     throw new Error(`Gemini failed: ${res.status} ${text}`);
//   }
//   const data = await res.json();
//   return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
// }
// ---------------------------------------------------------------------------
*/
