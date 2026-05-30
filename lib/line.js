// lib/line.js
// LINE Messaging API まわり：署名検証 / reply / broadcast。
// node:crypto と グローバル fetch のみで完結（@line/bot-sdk 不使用）。

import crypto from 'node:crypto';

const LINE_API = 'https://api.line.me/v2/bot';

/**
 * x-line-signature を HMAC-SHA256(base64) で検証する。
 * rawBody は「LINE が送ってきた生のリクエストボディ」（Buffer もしくは文字列）。
 * 改ざん検知のため timingSafeEqual で比較する。
 */
export function verifySignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function linePost(path, payload) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const res = await fetch(LINE_API + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

/** 受信イベントの replyToken に対して返信する。messages は配列（最大5件）。 */
export function replyMessage(replyToken, messages) {
  return linePost('/message/reply', { replyToken, messages });
}

/** 全友だちへ一斉配信する。messages は配列（最大5件）。 */
export function broadcastMessage(messages) {
  return linePost('/message/broadcast', { messages });
}
