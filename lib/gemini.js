// lib/gemini.js
// Gemini（Google Generative Language API）連携の共通基盤。
// 素の fetch のみで完結（@google/generative-ai などの SDK は使わない方針）。
//
// 各 feature には ctx.gemini として丸ごと渡される。
// 執事の雑談・あらすじ要約・レコメンド文生成などはこの generateText を使って実装する想定。
// GEMINI_API_KEY が未設定の場合は呼び出し時にエラーになる。

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 既定モデル。必要なら GEMINI_MODEL で上書きできる。
const DEFAULT_MODEL = 'gemini-3.5-flash';

/**
 * プロンプトを Gemini に渡してテキストを生成する。
 * @param {string} prompt ユーザー入力（生成させたい内容）
 * @param {{ system?: string, model?: string }} [opts]
 *   system: システムプロンプト（執事人格など。lib/persona.js の BUTLER_PROMPT を渡す想定）
 *   model:  使用モデル（既定は GEMINI_MODEL または gemini-3.5-flash）
 * @returns {Promise<string>} 生成されたテキスト
 */
export async function generateText(prompt, opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const model = opts.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (opts.system) {
    payload.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
