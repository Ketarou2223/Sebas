// api/webhook.js
// 機能②：公開中一覧。LINE の webhook を受け、署名検証してから応答する。
// Vercel に body を自動パースさせず、ストリームから raw body を読んで HMAC 検証する。

import { verifySignature, replyMessage } from '../lib/line.js';
import { getNowPlayingJP } from '../lib/tmdb.js';
import { nowPlayingMessages, usageMessage } from '../lib/messages.js';

// Vercel(@vercel/node) の自動ボディパースを無効化し、生ボディを自前で読む
export const config = { api: { bodyParser: false } };

// 「公開中」を尋ねるトリガー語（部分一致）
const TRIGGERS = ['今公開', '公開中', '上映中', 'いま公開', '今上映', '今やってる'];

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

async function handleEvent(event) {
  // テキストメッセージ以外は無視
  if (event.type !== 'message' || event.message?.type !== 'text') return;

  const text = event.message.text || '';
  const isTrigger = TRIGGERS.some((t) => text.includes(t));

  if (isTrigger) {
    const movies = await getNowPlayingJP();
    if (movies.length) {
      await replyMessage(event.replyToken, nowPlayingMessages(movies));
    } else {
      await replyMessage(event.replyToken, [
        { type: 'text', text: '現在、公開中の映画を取得できませんでした🙏 少し時間をおいて再度お試しください。' },
      ]);
    }
    return;
  }

  // トリガーに当たらなければ使い方を案内
  await replyMessage(event.replyToken, usageMessage());
}
