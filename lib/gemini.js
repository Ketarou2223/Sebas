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

// リトライ対象ステータス。過負荷・一時的エラー。
const RETRYABLE = new Set([429, 500, 503]);

// 初回 + リトライ最大3回 = 計4回まで試みる。
const MAX_ATTEMPTS = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * プロンプトを Gemini に渡してテキストを生成する。
 * 429 / 500 / 503 およびネットワークエラーは指数バックオフでリトライ（最大3回）。
 * 400 / 401 / 404 など恒久的エラーはリトライせず null を返す。
 * 全リトライ消耗後も null を返す（呼び出し側のフォールバック挙動を維持）。
 * @param {string} prompt ユーザー入力（生成させたい内容）
 * @param {{ system?: string, model?: string }} [opts]
 *   system: システムプロンプト（執事人格など。lib/persona.js の BUTLER_PROMPT を渡す想定）
 *   model:  使用モデル（既定は GEMINI_MODEL または gemini-3.5-flash）
 * @returns {Promise<string|null>} 生成されたテキスト。失敗時は null
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

  const fetchOpts = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // 1000ms → 2000ms → 4000ms、各回 ±300ms のジッター
      const base = 1000 * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 600) - 300;
      await sleep(base + jitter);
    }

    let res;
    try {
      res = await fetch(url, fetchOpts);
    } catch (err) {
      // ネットワークエラーはリトライ対象
      console.warn(`[gemini] network error (attempt ${attempt + 1}/${MAX_ATTEMPTS}):`, err.message);
      continue;
    }

    if (!res.ok) {
      if (RETRYABLE.has(res.status)) {
        console.warn(`[gemini] ${res.status} (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying...`);
        continue;
      }
      // 400 / 401 / 404 など恒久的エラーはリトライしない
      const errText = await res.text().catch(() => '');
      console.error(`[gemini] permanent error: ${res.status} ${errText}`);
      return null;
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  console.error('[gemini] all retries exhausted');
  return null;
}
