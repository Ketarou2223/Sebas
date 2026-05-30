// features/movie.js
// 映画機能。webhook と cron の映画まわりのロジックをここに集約する。
//   - 公開中一覧（webhook）：「今公開」等のメッセージに公開中の映画を返信
//   - 公開日プッシュ（cron）：その日 日本で劇場公開される新作を全友だちへ配信
//
// 共通インターフェース（name / match / handle）を実装しつつ、
// cron から呼ぶ pushTodayReleases() も併せて export する。

import { getNowPlayingJP, getTodayReleasesJP } from '../lib/tmdb.js';
import { broadcastMessage } from '../lib/line.js';
import { nowPlayingMessages, todayReleaseMessages } from '../lib/messages.js';

// 「公開中」を尋ねるトリガー語（部分一致）
const TRIGGERS = ['今公開', '公開中', '上映中', 'いま公開', '今上映', '今やってる'];

/** 機能名。 */
export const name = 'movie';

/** このメッセージを映画機能が担当すべきか。 */
export function match(text) {
  return TRIGGERS.some((t) => text.includes(t));
}

/**
 * 公開中一覧を返信する（webhook 用）。
 * @param {object} event LINE の message イベント
 * @param {{ reply: Function }} ctx 共通基盤（reply で返信）
 */
export async function handle(event, ctx) {
  const movies = await getNowPlayingJP();
  if (movies.length) {
    await ctx.reply(nowPlayingMessages(movies));
  } else {
    await ctx.reply([
      {
        type: 'text',
        text: '現在、公開中の映画を取得できませんでした🙏 少し時間をおいて再度お試しください。',
      },
    ]);
  }
}

/**
 * 本日 日本で劇場公開される新作を全友だちへ broadcast する（cron 用）。
 * 新作ゼロの日は配信しない。
 * @returns {Promise<{ broadcasted: boolean, count: number }>}
 */
export async function pushTodayReleases() {
  const movies = await getTodayReleasesJP();
  if (!movies.length) {
    return { broadcasted: false, count: 0 };
  }
  await broadcastMessage(todayReleaseMessages(movies));
  return { broadcasted: true, count: Math.min(movies.length, 12) };
}
