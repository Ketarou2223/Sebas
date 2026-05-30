// api/cron.js
// 公開日プッシュの起動口。Vercel Cron から毎日 10:00 JST（"0 1 * * *" UTC）に実行される。
// 認証だけ行い、実処理（その日の新作を broadcast）は features/movie.js に集約してある。

import { pushTodayReleases } from '../features/movie.js';

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
    const result = await pushTodayReleases();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron] error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
