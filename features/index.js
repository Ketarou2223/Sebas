// features/index.js
// 全機能（feature）のレジストリ。
// 新機能を追加したら、ここに import して features 配列へ登録するだけでよい。
// （webhook.js 本体は触らない。登録順に match されるので、具体的な機能ほど上に置く）

import * as movie from './movie.js';
import { usageMessage } from '../lib/messages.js';

/**
 * 登録済み機能の一覧。各要素は { name, match(text), handle(event, ctx) } を持つ。
 * webhook は先頭から順に match() を呼び、最初に true を返した機能の handle() を実行する。
 */
export const features = [movie];

/**
 * どの機能の match にも当たらなかったときの応答（ヘルプ/案内）。
 * 将来、執事の雑談（Gemini）に差し替えるのもここで行う。webhook.js は編集しない。
 * @param {object} event LINE の message イベント
 * @param {object} ctx 共通基盤（reply / gemini / store / butlerPrompt）
 */
export async function fallback(event, ctx) {
  await ctx.reply(usageMessage());
}
