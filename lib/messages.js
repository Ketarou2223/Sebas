// lib/messages.js
// TMDB の作品配列から LINE Flex カルーセル（ポスター付き）を組み立てる。

import { posterUrl } from './tmdb.js';

// ポスターが無い作品向けのフォールバック画像（HTTPS 必須）
const FALLBACK_IMAGE = 'https://placehold.co/500x750/cccccc/333333?text=No+Image';

// Flex カルーセルの最大バブル数
const MAX_BUBBLES = 12;

function bubble(movie) {
  const image = posterUrl(movie.poster_path) || FALLBACK_IMAGE;
  const title = movie.title || movie.original_title || 'タイトル不明';
  const date = movie.release_date ? `公開日: ${movie.release_date}` : '';
  const score =
    typeof movie.vote_average === 'number' && movie.vote_average > 0
      ? `★ ${movie.vote_average.toFixed(1)}`
      : '';

  const bodyContents = [
    { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true, maxLines: 2 },
  ];
  if (date) bodyContents.push({ type: 'text', text: date, size: 'sm', color: '#888888', margin: 'sm' });
  if (score) bodyContents.push({ type: 'text', text: score, size: 'sm', color: '#f0a020' });

  return {
    type: 'bubble',
    hero: {
      type: 'image',
      url: image,
      size: 'full',
      aspectRatio: '2:3',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: bodyContents,
    },
  };
}

/** 作品配列を Flex カルーセルメッセージ（1件）にする。最大12件にトリミング。 */
export function flexCarousel(altText, movies) {
  const bubbles = movies.slice(0, MAX_BUBBLES).map(bubble);
  return {
    type: 'flex',
    altText,
    contents: { type: 'carousel', contents: bubbles },
  };
}

/** cron 配信用：導入テキスト + 本日公開カルーセル。 */
export function todayReleaseMessages(movies) {
  const count = Math.min(movies.length, MAX_BUBBLES);
  return [
    { type: 'text', text: `🎬 本日、日本で劇場公開の映画です（${count}件）` },
    flexCarousel('本日公開の映画', movies),
  ];
}

/** webhook 応答用：導入テキスト + 公開中カルーセル。 */
export function nowPlayingMessages(movies) {
  return [
    { type: 'text', text: '🍿 現在、劇場で公開中の映画です' },
    flexCarousel('公開中の映画', movies),
  ];
}

/** トリガーに当たらなかったときの使い方案内。 */
export function usageMessage() {
  return [
    {
      type: 'text',
      text:
        '映画ボットです🎬\n\n「今公開」「公開中」「上映中」のいずれかを送ると、いま劇場公開中の映画をポスター付きでお届けします。\n\nまた、朝のご挨拶（天気の進言）と、その日公開の新作のお知らせを毎日自動でお届けします。',
    },
  ];
}
