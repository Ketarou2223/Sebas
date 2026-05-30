// features/index.js
// 全機能（feature）のレジストリ。
// 新機能を追加したら、ここに import して features 配列へ登録するだけでよい。
// （webhook.js 本体は触らない。登録順に match されるので、具体的な機能ほど上に置く）

import * as movie from './movie.js';
import * as review from './review.js';
import * as butler from './butler.js';
import { usageMessage } from '../lib/messages.js';

/**
 * 登録済み機能の一覧。各要素は { name, match(text), handle(event, ctx) } を持つ。
 * webhook は先頭から順に match() を呼び、最初に true を返した機能の handle() を実行する。
 *
 * 登録順（重要）：
 *   1. movie  … 「今公開」等の具体トリガー
 *   2. review … 「感想」「感想一覧」「おすすめ」等の具体トリガー
 *   3. butler … match が常に true の高機能フォールバック。必ず最後に置く。
 * butler が最後に全てを受けるため、下の fallback() は実質的に呼ばれない。
 */
export const features = [movie, review, butler];

/**
 * どの機能の match にも当たらなかったときの応答（ヘルプ/案内）。
 * 現在は butler（features 末尾）が常に match するため通常は到達しないが、
 * 将来 butler を外した場合の保険として案内メッセージを残しておく。webhook.js は編集しない。
 * @param {object} event LINE の message イベント
 * @param {object} ctx 共通基盤（reply / gemini / store / butlerPrompt）
 */
export async function fallback(event, ctx) {
  await ctx.reply(usageMessage());
}
