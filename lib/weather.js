// lib/weather.js
// Open-Meteo（APIキー不要）から当日の天気を取得する共通基盤。
// グローバル fetch のみで完結（外部 SDK 不使用）。
//
// 座標は固定（阪大豊中キャンパス付近）。取得失敗時は null を返し、
// 呼び出し側（features/morning.js）は天気パートを省略してフォールバックする。

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';

// 固定座標：大阪大学 豊中キャンパス付近
const LAT = 34.808;
const LON = 135.435;

// WMO weather code → 日本語の天気概況
const WEATHER_CODE_TEXT = {
  0: '快晴',
  1: '概ね晴れ',
  2: '一部曇り',
  3: '曇り',
  45: '霧',
  48: '霧（着氷）',
  51: '弱い霧雨',
  53: '霧雨',
  55: '強い霧雨',
  56: '着氷性の霧雨',
  57: '強い着氷性の霧雨',
  61: '弱い雨',
  63: '雨',
  65: '強い雨',
  66: '着氷性の雨',
  67: '強い着氷性の雨',
  71: '弱い雪',
  73: '雪',
  75: '強い雪',
  77: '霧雪',
  80: 'にわか雨',
  81: '強いにわか雨',
  82: '激しいにわか雨',
  85: 'にわか雪',
  86: '強いにわか雪',
  95: '雷雨',
  96: '雹を伴う雷雨',
  99: '激しい雹を伴う雷雨',
};

/** WMO weather code を日本語の概況に変換する（不明なら「不明」）。 */
export function weatherCodeText(code) {
  return WEATHER_CODE_TEXT[code] ?? '不明';
}

/**
 * 当日（Asia/Tokyo）の天気を取得する。
 * 最高/最低気温・降水確率・UV指数・天気概況をまとめて返す。
 * @returns {Promise<null | {
 *   tempMax: number, tempMin: number,
 *   precipProb: number, uvMax: number,
 *   weatherCode: number, summary: string
 * }>} 取得失敗時は null
 */
export async function getWeather() {
  const url = new URL(FORECAST_BASE);
  url.searchParams.set('latitude', String(LAT));
  url.searchParams.set('longitude', String(LON));
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code',
  );
  url.searchParams.set('timezone', 'Asia/Tokyo');
  url.searchParams.set('forecast_days', '1');

  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      console.error('[weather] fetch failed:', res.status);
      return null;
    }
    const data = await res.json();
    const d = data?.daily;
    if (!d) return null;

    const code = d.weather_code?.[0];
    return {
      tempMax: d.temperature_2m_max?.[0],
      tempMin: d.temperature_2m_min?.[0],
      precipProb: d.precipitation_probability_max?.[0],
      uvMax: d.uv_index_max?.[0],
      weatherCode: code,
      summary: weatherCodeText(code),
    };
  } catch (err) {
    console.error('[weather] error:', err);
    return null;
  }
}
