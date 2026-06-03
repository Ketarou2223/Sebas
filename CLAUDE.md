# CLAUDE.md — 執事ボット Sebas

このファイルは Claude（および開発者）への引き継ぎ資料です。**機能を追加・変更したら、このファイルと `docs/` を必ず一緒に更新してください。**

## プロジェクト概要

LINE 公式アカウント用の執事ボット「**Sebas（セバス）**」。ユーザーのメッセージに執事らしく応対し、映画情報の配信などを行う。今後 features を足して多機能化していく前提の土台。

- **実行基盤**: Node.js 18+ / Vercel Serverless Functions（`/api` 配下）+ Vercel Cron
- **依存パッケージ: ゼロ**。グローバル `fetch` と `node:crypto` のみで完結（LINE SDK・Gemini SDK・Upstash SDK いずれも不使用）
- **データソース / 連携**: TMDB（映画情報）、Gemini（文章生成の土台）、Upstash Redis（永続ストレージの土台）
- ESM（`package.json` の `"type": "module"`）

## アーキテクチャの要点

機能は **features レジストリ方式** で管理する。詳細は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

- **`api/webhook.js` はルーターのみ**。署名検証 → イベントをパース → 登録機能を順に `match()` → 最初に当たった機能の `handle()` を呼ぶ → どれも当たらなければ `fallback()`。機能の中身は持たない。
- **`features/`**: 1機能 = 1ファイル。共通インターフェース `{ name, match(text), handle(event, ctx) }` を実装する。`features/index.js` が全機能を配列に登録してエクスポートする。
- **`ctx`**（各機能の `handle` に渡される共通基盤）: `{ event, reply, gemini, store, butlerPrompt }`
  - `reply(messages)`: その相手へ返信（LINE メッセージ配列・最大5件）
  - `gemini`: `lib/gemini.js`（`generateText(prompt, { system })`）
  - `store`: `lib/store.js`（`get/set/del`。Upstash 未設定なら no-op）
  - `butlerPrompt`: `lib/persona.js` の執事システムプロンプト
- **`lib/`**: 共通基盤。`line.js`（署名検証/reply/broadcast）, `tmdb.js`（TMDB 取得）, `weather.js`（Open-Meteo 取得・APIキー不要）, `messages.js`（Flex 生成）, `gemini.js`, `store.js`, `memory.js`, `persona.js`, `backstory.js`（Sebas の来歴設定・内容は非開示運用）。
- **会話メモリ**（`lib/memory.js`）: ユーザー単位で短期バッファ（直近の生発話）と長期メモ（人物像 JSON）を保持。butler は応答前に文脈注入し、応答後に `pushTurn` → 7往復たまると Gemini 要約で長期メモ更新（15項目超は統合）。**「保持」と「発露」は分離**し、発露は `persona.js` のルールで抑制（普段は持ち出さず、話題が関連したときだけ自然に触れる）。Upstash 未設定なら no-op。詳細は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
- **push エンドポイントの役割**: 時刻管理は外部 cron（cron-job.org）に移行済み。Vercel 側のエンドポイントは時刻を持たず、`CRON_SECRET` 認証だけ行って実処理を feature に委譲する。
  - `api/cron.js`（**6:30 JST 想定**）: 認証後に `features/morning.js` の `pushMorningGreeting()` を呼ぶ（挨拶＋天気の進言のみ・テキスト1通）。
  - `api/movie-push.js`（**12:00 JST 想定**）: 認証後に `features/movie.js` の `pushTodayReleases()` を呼ぶ（その日公開の新作を Flex で broadcast。0件なら無配信）。
  - ロジックは feature 側に集約する。`features/morning.js` は push 専用のため `match`/`handle` を持たず `features/index.js` には登録しない（webhook の会話には反応しない）。
  - **push エンドポイントを足したら、外部 cron 側にもジョブ（URL ＋ `Authorization: Bearer <CRON_SECRET>` ヘッダ）の登録が別途必要。**

## 開発ルール

1. **新機能は `features/` に1ファイル追加し、`features/index.js` に登録する。** `features/_template.js` をコピーして始める。
2. **`api/webhook.js` 本体は触らない。** ルーティングの仕組みが変わるとき以外は編集不要。
3. **機能を追加/変更したら [`docs/FEATURES.md`](docs/FEATURES.md) の表を必ず更新する。** 必要なら `docs/ARCHITECTURE.md` も。
4. **外部依存パッケージは入れない。** 素の `fetch` と Node 標準モジュールで実装する（`package.json` の dependencies は空のまま）。
5. **環境変数を追加したら `.env.example` と この CLAUDE.md の env 一覧を更新する。**
6. push（cron）から使う処理は feature 側に置き、`api/*.js` のエンドポイントからは import するだけにする。push エンドポイントを増やしたら外部 cron 側にもジョブ登録が必要。

## 環境変数

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `TMDB_API_KEY` | ✅ | TMDB の API キー（v3 auth）。映画情報の取得に使用 |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Messaging API のチャネルアクセストークン（長期）。reply/broadcast に使用 |
| `LINE_CHANNEL_SECRET` | ✅ | LINE チャネルシークレット。webhook の署名検証に使用 |
| `CRON_SECRET` | 任意 | 設定すると push エンドポイント（`/api/cron`・`/api/movie-push`）が `Authorization: Bearer <CRON_SECRET>` を要求。外部 cron（cron-job.org）のジョブにこのヘッダを設定する |
| `VERIFY_SIGNATURE` | 任意 | `"false"` で webhook の署名検証をスキップ（デバッグ専用）。本番は未設定のまま |
| `GEMINI_API_KEY` | 任意 | Gemini（`lib/gemini.js`）の文章生成に使用。雑談等の機能を足すと必要 |
| `GEMINI_MODEL` | 任意 | 使用する Gemini モデル（未設定なら `gemini-3.5-flash`） |
| `UPSTASH_REDIS_REST_URL` | 任意 | Upstash Redis REST のエンドポイント。`lib/store.js` が使用 |
| `UPSTASH_REDIS_REST_TOKEN` | 任意 | Upstash Redis REST のトークン。URL と両方揃うとストアが有効になる |

## ローカル確認・デプロイの要点

- **ローカル**: `npm run dev`（= `vercel dev`）。`.env.example` を `.env`（または Vercel 環境変数）にコピーして値を設定。
- **構文チェック**: `node --check <file>` で各ファイルを検査できる（依存ゼロなのでビルド不要）。
- **デプロイ**: GitHub に push → Vercel で Import（または `vercel` CLI）。環境変数は Vercel の Settings に登録し、変更後は再デプロイが必要。
- **Cron（外部）**: 時刻管理は外部 cron（cron-job.org）に移行。`vercel.json` は `crons` を持たない。外部 cron に2ジョブを登録する：`GET /api/cron`（6:30 JST 想定・朝のご挨拶）と `GET /api/movie-push`（12:00 JST 想定・映画プッシュ）。いずれも `Authorization: Bearer <CRON_SECRET>` ヘッダを付与すること。
- **webhook の動作確認**: `VERIFY_SIGNATURE=false` で署名検証を一時的に外せる（確認後は必ず戻す）。
- 詳しいセットアップ（TMDB/LINE のキー取得、Webhook URL 設定）は [`README.md`](README.md) を参照。
