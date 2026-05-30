// lib/tmdb.js
// TMDB からの取得系。全リクエストで region=JP / language=ja-JP を固定する。
// グローバル fetch のみで完結（外部 SDK 不使用）。

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

// すべての TMDB リクエストに付与する共通パラメータ
const COMMON = { region: 'JP', language: 'ja-JP' };

async function tmdbGet(path, params = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY is not set');

  const url = new URL(TMDB_BASE + path);
  const merged = { api_key: apiKey, ...COMMON, ...params };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * 「当日」を JST で算出して YYYY-MM-DD を返す。
 * UTC で実行されても日付がズレないよう、UTC ミリ秒に +9h してから日付要素を取り出す。
 */
export function jstTodayString(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** poster_path から完全な画像 URL を作る（無ければ null）。 */
export function posterUrl(path) {
  return path ? IMG_BASE + path : null;
}

/**
 * その日に日本で劇場公開される作品。
 * discover/movie で release_date を当日（JST）に固定し、劇場公開タイプのみを対象にする。
 */
export async function getTodayReleasesJP() {
  const today = jstTodayString();
  const data = await tmdbGet('/discover/movie', {
    'release_date.gte': today,
    'release_date.lte': today,
    with_release_type: '2|3', // 2: Theatrical (limited), 3: Theatrical
    sort_by: 'popularity.desc',
  });
  return data.results || [];
}

/** 現在 日本で劇場公開中の作品。 */
export async function getNowPlayingJP() {
  const data = await tmdbGet('/movie/now_playing', { page: 1 });
  return data.results || [];
}
