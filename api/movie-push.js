// api/movie-push.js
// 本日公開の映画プッシュの起動口。
// 時刻は持たず、外部 cron（cron-job.org）が CRON_SECRET 付きで叩くことで起動する。
// 認証だけ行い、実処理（その日の新作を broadcast。0件なら何もしない）は
// features/movie.js の pushTodayReleases() に集約してある。

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
    // ログ確認しやすいよう { ok, broadcasted, count } を返す
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[movie-push] error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
