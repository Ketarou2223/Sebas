# アーキテクチャ

執事ボット Sebas は **features レジストリ方式** を採用している。機能の追加は「`features/` に1ファイル足して `features/index.js` に登録する」だけで完結し、ルーター（`api/webhook.js`）は触らない。

## ディレクトリ構成

```
api/
  webhook.js     # LINE webhook の薄いルーター（署名検証 → ルーティングのみ。本体は編集しない）
  cron.js        # Vercel Cron の起動口。認証だけ行い実処理は features/movie.js を import
features/
  index.js       # 全機能のレジストリ。features 配列（movie → review → butler）と fallback をエクスポート
  movie.js       # 映画機能（公開中一覧 + cron 用 pushTodayReleases）
  review.js      # 感想の記録 / 振り返り / おすすめ判定（store + gemini）
  butler.js      # 自由文の執事雑談（match 常時 true の高機能フォールバック・末尾登録）
  _template.js   # 新機能のひな形（コピーして使う。index.js には登録しない）
lib/
  line.js        # 署名検証 / reply / broadcast（node:crypto + fetch）
  tmdb.js        # TMDB 取得系（JST 当日算出 / discover / now_playing）
  messages.js    # Flex カルーセル等の LINE メッセージ生成
  gemini.js      # Gemini 文章生成の共通基盤（fetch のみ）
  store.js       # Upstash Redis REST の共通基盤（未設定なら no-op）
  persona.js     # 執事 Sebas のシステムプロンプト（人格・口調）
docs/
  ARCHITECTURE.md  # このファイル
  FEATURES.md      # 機能の目次（表）
CLAUDE.md        # 開発ルール・引き継ぎ資料
vercel.json      # Cron 設定（"0 1 * * *" = 10:00 JST）
package.json     # 依存ゼロ / ESM
.env.example     # 環境変数のテンプレート
```

## メッセージが届いてから返信するまで（webhook）

```
LINE プラットフォーム
      │  POST /api/webhook（x-line-signature 付き）
      ▼
┌─────────────────────────── api/webhook.js（ルーター）──────────────────────────┐
│ 1. raw body を読む                                                            │
│ 2. 署名検証（HMAC-SHA256, lib/line.js）  ── NG → 401                           │
│ 3. JSON パース → events を取り出す（以降は常に 200 を返す）                    │
│ 4. テキストメッセージ以外は無視                                               │
│ 5. ctx を構築 = { event, reply, gemini, store, butlerPrompt }                 │
│ 6. features を順に match(text)                                                │
│       ├─ 当たった最初の機能 → handle(event, ctx)                              │
│       └─ どれも当たらない   → fallback(event, ctx)                            │
└──────────────────────────────────────────────────────────────────────────────┘
      │ handle/fallback 内で ctx.reply(messages)
      ▼
lib/line.js → POST https://api.line.me/v2/bot/message/reply
      ▼
ユーザーに返信が届く
```

ポイント:

- ルーターは「検証とルーティング」だけ。機能ごとの分岐やビジネスロジックは持たない。
- `features.find(f => f.match(text))` で **登録順に最初に当たった1つ** だけが処理する。具体的なトリガーを持つ機能ほど配列の前に置くと安全。
- `handle` から外部 API を呼ぶときは `ctx`（reply / gemini / store / butlerPrompt）と `lib/` を使う。
- 末尾の `butler` は `match` が常時 true のため、他機能がハズれたテキストをすべて受ける。結果として `index.js` の `fallback()` には通常到達しない（butler を外したときの保険として残置）。

## 公開日プッシュ（cron）の流れ

```
Vercel Cron（毎日 0 1 * * * UTC = 10:00 JST）
      │  GET /api/cron（CRON_SECRET 設定時は Authorization 付き）
      ▼
api/cron.js  ── 認証だけ行う（NG → 401）
      │  import { pushTodayReleases } from features/movie.js
      ▼
features/movie.js: pushTodayReleases()
      ├─ TMDB から本日 日本公開の新作を取得（lib/tmdb.js）
      ├─ 新作ゼロ → 何も配信せず { broadcasted:false, count:0 }
      └─ あり → lib/line.js broadcast で全友だちへ配信
```

映画関連のロジックは webhook 用も cron 用も `features/movie.js` に集約されている。cron はそれを import するだけ。
