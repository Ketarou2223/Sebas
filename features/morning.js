// features/morning.js
// 朝のご挨拶機能（push 専用）。「執事の朝のご挨拶 ＋ 天気からの軽い進言」を
// 1通にまとめて全友だちへ broadcast する。
//
// 時刻は持たない：実際の起動時刻は外部 cron（cron-job.org）が /api/cron を叩くことで決める。
// 映画のプッシュは別エンドポイント（/api/movie-push → features/movie.js）に分離してある。
//
// ※ これは push 専用機能。webhook の会話には反応しないので match/handle は持たず、
//    features/index.js には登録しない。cron からは pushMorningGreeting() を import する。

import { getWeather } from '../lib/weather.js';
import { broadcastMessage } from '../lib/line.js';
import { generateText } from '../lib/gemini.js';
import { BUTLER_PROMPT } from '../lib/persona.js';

// Gemini 失敗時 / 天気なし時のフォールバック挨拶
const FALLBACK_GREETING =
  'おはようございます、ご主人様。本日も良い一日となりますように。';

/**
 * 天気の数値を Gemini に渡し、執事 Sebas としての朝の挨拶＋進言を生成する。
 * 天気が取れない場合（weather=null）はシンプルな朝の挨拶のみを生成する。
 * @param {null | object} weather lib/weather.js の getWeather() の戻り値
 * @returns {Promise<string>}
 */
async function buildGreeting(weather) {
  let prompt;
  if (weather) {
    prompt = [
      '以下は本日の天気予報の数値です（大阪・豊中）。',
      `最高気温: ${weather.tempMax}℃ / 最低気温: ${weather.tempMin}℃ / `
        + `降水確率: ${weather.precipProb}% / UV指数: ${weather.uvMax} / 概況: ${weather.summary}`,
      '',
      'これを踏まえ、執事 Sebas として主人への朝のご挨拶を作成してください。',
      '- 「おはようございます」から始める。',
      '- 数値をそのまま読み上げるのではなく、主人が今日どう過ごすべきかを軽く提案する。',
      '- 気温が高ければ薄着、低ければ上着、降水確率が高ければ傘、UVが高ければ日焼け止め、など該当するものだけ自然に触れる。',
      '- フラットで簡潔に、2〜3行程度。くどくせず、押しつけない。',
    ].join('\n');
  } else {
    prompt = [
      '執事 Sebas として、主人への簡潔な朝のご挨拶を作成してください。',
      '「おはようございます」から始め、1〜2行で。天気には触れないでください。',
    ].join('\n');
  }

  try {
    const text = await generateText(prompt, { system: BUTLER_PROMPT });
    return text?.trim() || FALLBACK_GREETING;
  } catch (err) {
    console.error('[morning] gemini failed:', err);
    return FALLBACK_GREETING;
  }
}

/**
 * 朝のご挨拶（挨拶＋天気の進言）を全友だちへ broadcast する。
 *   1. 天気を取得（失敗時は天気パートを省略し挨拶のみ）
 *   2. 天気の数値から執事の挨拶＋進言を生成
 *   3. テキスト1通として配信
 * @returns {Promise<{ ok: boolean, weather: boolean }>}
 */
export async function pushMorningGreeting() {
  // 1. 天気（失敗しても続行）
  const weather = await getWeather();

  // 2. 挨拶＋進言
  const greeting = await buildGreeting(weather);

  // 3. テキスト1通として配信
  await broadcastMessage([{ type: 'text', text: greeting }]);

  return { ok: true, weather: Boolean(weather) };
}
