// api/webhook.js
// LINE webhook の「薄いルーター」。
// 役割は次の4つだけで、機能ごとの中身は持たない：
//   1) 署名検証（raw body を読んで HMAC-SHA256 で検証）
//   2) イベントをパース
//   3) 登録機能（features）を順に match し、最初に当たった機能の handle を呼ぶ
//   4) どれも当たらなければ fallback（ヘルプ/案内）を呼ぶ
//
// ★ 新機能の追加は features/ にファイルを足して features/index.js に登録するだけ。
//   このファイル本体は原則編集しない。

import { verifySignature, replyMessage } from '../lib/line.js';
import { features, fallback } from '../features/index.js';
import * as gemini from '../lib/gemini.js';
import { store } from '../lib/store.js';
import { BUTLER_PROMPT } from '../lib/persona.js';

// Vercel(@vercel/node) の自動ボディパースを無効化し、生ボディを自前で読む
export const config = { api: { bodyParser: false } };

/** リクエストストリームから raw body を Buffer として読む。 */
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  // 1) 生ボディを読む（署名検証に必要）
  let raw;
  try {
    raw = await readRawBody(req);
  } catch (err) {
    console.error('[webhook] read body failed:', err);
    return res.status(200).json({ ok: true }); // LINE にリトライさせない
  }

  // 2) 署名検証（VERIFY_SIGNATURE=false のときだけスキップ）
  const shouldVerify = process.env.VERIFY_SIGNATURE !== 'false';
  if (shouldVerify) {
    const signature = req.headers['x-line-signature'];
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!verifySignature(raw, signature, secret)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
  }

  // 3) パースしてイベント処理。以降は何があっても 200 を返す（リトライ防止）。
  let body;
  try {
    body = JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    body = {};
  }

  const events = Array.isArray(body.events) ? body.events : [];
  await Promise.all(
    events.map((event) =>
      handleEvent(event).catch((err) => console.error('[webhook] event error:', err))
    )
  );

  return res.status(200).json({ ok: true });
}

/**
 * 1イベントを features にルーティングする。
 * テキストメッセージ以外は無視。登録機能を順に match し、最初に当たった handle を実行。
 * どれも当たらなければ fallback を呼ぶ。
 */
async function handleEvent(event) {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message?.type !== 'text') return;

  const text = event.message.text || '';

  // 各機能へ渡す共通基盤
  const ctx = {
    event,
    reply: (messages) => replyMessage(event.replyToken, messages),
    gemini,
    store,
    butlerPrompt: BUTLER_PROMPT,
  };

  const feature = features.find((f) => f.match(text));
  if (feature) {
    await feature.handle(event, ctx);
    return;
  }

  // どの機能にも当たらなかった場合のフォールバック
  await fallback(event, ctx);
}
