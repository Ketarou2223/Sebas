// api/cron.js
// 機能①：公開日プッシュ。Vercel Cron から毎日 10:00 JST（"0 1 * * *" UTC）に実行。
// その日に日本で劇場公開される作品を broadcast で全友だちに配信する。

import { getTodayReleasesJP } from '../lib/tmdb.js';
import { broadcastMessage } from '../lib/line.js';
import { todayReleaseMessages } from '../lib/messages.js';

export default async function handler(req, res) {
  // CRON_SECRET 設定時は Authorization: Bearer <CRON_SECRET> を検証
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  try {
    const movies = await getTodayReleasesJP();

    // 新作ゼロの日は配信しない
    if (!movies.length) {
      return res.status(200).json({ ok: true, broadcasted: false, count: 0 });
    }

    await broadcastMessage(todayReleaseMessages(movies));
    return res
      .status(200)
      .json({ ok: true, broadcasted: true, count: Math.min(movies.length, 12) });
  } catch (err) {
    console.error('[cron] error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
