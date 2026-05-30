# 機能一覧（FEATURES）

執事ボット Sebas の機能目次。**機能を追加・変更したら、この表を必ず更新すること**（CLAUDE.md の開発ルール参照）。

状態の凡例: 🟢 稼働 / 🟡 予定（土台のみ・未実装）

| 機能名 | トリガー | 概要 | 対応ファイル | 状態 |
| --- | --- | --- | --- | --- |
| movie（公開中一覧） | 「今公開」「公開中」「上映中」「いま公開」「今上映」「今やってる」を含むメッセージ | 現在 日本で劇場公開中の映画をポスター付き Flex カルーセルで返信 | `features/movie.js`（`handle`）, `lib/tmdb.js`, `lib/messages.js` | 🟢 |
| movie（公開日プッシュ） | Vercel Cron（毎日 10:00 JST） | その日 日本で劇場公開される新作を全友だちへ broadcast。新作ゼロの日は配信しない | `features/movie.js`（`pushTodayReleases`）, `api/cron.js`, `lib/tmdb.js`, `lib/messages.js` | 🟢 |
| fallback（ヘルプ/案内） | どの機能にも当たらないテキスト | 使い方の案内メッセージを返信 | `features/index.js`（`fallback`）, `lib/messages.js` | 🟢 |

## 今後の追加予定（土台のみ）

これらは基盤（`lib/`）だけ用意済みで、`features/` への実装は今後行う。追加時にこの表へ行を足すこと。

| 候補 | 使う基盤 | メモ | 状態 |
| --- | --- | --- | --- |
| 執事の雑談 | `lib/gemini.js`, `lib/persona.js` | 当たらなかったメッセージに Gemini で執事らしく応答（fallback の差し替え） | 🟡 |
| 感想の記録 など | `lib/store.js`（Upstash） | ユーザーごとの状態保存が必要な機能 | 🟡 |

## 新機能の追加手順（要約）

1. `features/_template.js` をコピーして `features/<機能名>.js` を作る。
2. `name` / `match(text)` / `handle(event, ctx)` を実装する。
3. `features/index.js` の `features` 配列に登録する（具体的なトリガーほど前に置く）。
4. **この FEATURES.md の表に行を追加する。** 環境変数を増やしたなら `.env.example` と `CLAUDE.md` も更新。
