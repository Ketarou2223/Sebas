# 執事ボット Sebas（セバス）🎩

LINE 公式アカウント用の**執事ボット「Sebas（セバス）」**。ユーザー（ご主人様）のメッセージに執事らしく応対し、映画情報の配信や、観た映画の感想記録・おすすめ判定を行います。機能を足して多機能化していく前提の土台です。

- **実行基盤**: Node.js 18+ / Vercel Serverless Functions（`/api` 配下）+ Vercel Cron
- **依存パッケージ ゼロ**：グローバル `fetch` と `node:crypto` のみで完結（LINE SDK・Gemini SDK・Upstash SDK いずれも不使用）
- **データソース / 連携**: TMDB（映画情報）、Gemini（執事の文章生成）、Upstash Redis（感想の永続化）
- ESM（`package.json` の `"type": "module"`）

---

## できること

| カテゴリ | きっかけ（送る言葉 / タイミング） | 応答 |
| --- | --- | --- |
| 🎬 公開中の映画 | 「今公開」「公開中」「上映中」など | 現在 日本で公開中の映画をポスター付き Flex カルーセルで返信 |
| 🔔 新作公開のお知らせ | 毎朝 10:00 JST（自動・Vercel Cron） | その日 日本で劇場公開される新作を全友だちへ配信（新作ゼロの日は配信なし） |
| 📝 感想を記録 | 「感想 〇〇が面白かった」など「感想」で始める | 本文からタイトルと感想を抽出し、ユーザーごとに保存。執事口調で記録完了を返信 |
| 📚 感想の振り返り | 「感想一覧」「履歴」「観た映画」 | これまでの感想を「・タイトル：感想」の一覧で返信 |
| 👍 おすすめ判定 | 「〇〇はおすすめ？」「観るべき？」「見るべき？」 | 過去の感想からお好みを推し量り、執事 Sebas が合うかどうかを 2〜3 文で判定 |
| 💬 執事の雑談 | 上記以外のあらゆるメッセージ | 執事人格で自由に応対。必要に応じて上の機能も自然に案内 |

> 感想の記録・振り返り・おすすめ判定は **Upstash Redis**（永続化）と **Gemini**（文章生成）を、雑談は **Gemini** を使います。これらが未設定でも他機能は壊れず、感想は保存されない／雑談はお詫びの定型文を返す挙動になります。

---

## アーキテクチャ（features レジストリ方式）

機能は **1機能 = 1ファイル**で `features/` に置き、`features/index.js` の配列に登録するだけで増やせます。`api/webhook.js` は薄いルーターに徹し、機能の中身を持ちません。

```
api/
  webhook.js       # 薄いルーター（署名検証 → match → handle / fallback）。本体は原則触らない
  cron.js          # Vercel Cron の起動口。movie.js の pushTodayReleases() を呼ぶだけ
features/
  index.js         # 全機能のレジストリ（登録順 = match の優先順）
  _template.js     # 新機能のひな形
  movie.js         # 公開中一覧（webhook）＋ 公開日プッシュ（cron）
  review.js        # 感想の「記録 / 振り返り / おすすめ判定」を同居
  butler.js        # 自由文の執事雑談（match 常時 true の高機能フォールバック・末尾登録）
lib/
  line.js          # 署名検証 / reply / broadcast
  tmdb.js          # TMDB 取得（JST 当日算出 / now_playing / discover）
  messages.js      # Flex カルーセル・案内文の生成
  gemini.js        # Gemini 連携（generateText(prompt, { system })）
  store.js         # Upstash Redis（get/set/del + addReview/getReviews）。未設定なら no-op
  persona.js       # 執事 Sebas のシステムプロンプト（BUTLER_PROMPT）
vercel.json        # Cron 設定（"0 1 * * *" = 10:00 JST）
package.json
.env.example
```

webhook は登録機能を**先頭から順に `match()`** し、最初に当たった機能の `handle()` を実行します。`features/index.js` の登録順は：

1. `movie` … 「今公開」等の具体トリガー
2. `review` … 「感想」「感想一覧」「おすすめ」等の具体トリガー
3. `butler` … `match` 常時 true。**必ず最後**。他が全部ハズれたときだけ受ける高機能フォールバック

詳しくは [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) と [`docs/FEATURES.md`](docs/FEATURES.md)、開発ルールは [`CLAUDE.md`](CLAUDE.md) を参照してください。

---

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `TMDB_API_KEY` | ✅ | TMDB の API キー（v3 auth）。映画情報の取得に使用 |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Messaging API のチャネルアクセストークン（長期）。reply / broadcast に使用 |
| `LINE_CHANNEL_SECRET` | ✅ | LINE チャネルシークレット。webhook の署名検証に使用 |
| `GEMINI_API_KEY` | 推奨 | Gemini の文章生成。**執事の雑談（butler）・感想抽出・おすすめ判定（review）** に使用。未設定だと雑談はお詫び定型文になる |
| `GEMINI_MODEL` | 任意 | 使用する Gemini モデル（未設定なら `gemini-3.5-flash`） |
| `UPSTASH_REDIS_REST_URL` | 推奨 | Upstash Redis REST のエンドポイント。**感想の保存（review）** に使用 |
| `UPSTASH_REDIS_REST_TOKEN` | 推奨 | Upstash Redis REST のトークン。URL と両方揃うとストアが有効になる |
| `CRON_SECRET` | 任意 | 設定すると `/api/cron` が `Authorization: Bearer <CRON_SECRET>` を要求。Vercel Cron は自動付与 |
| `VERIFY_SIGNATURE` | 任意 | `"false"` で webhook の署名検証をスキップ（デバッグ専用）。本番は未設定のまま |

> 映画機能だけなら ✅ の3つで動きます。感想・雑談まで使うなら「推奨」も設定してください。

---

## セットアップ手順

### 1. TMDB API キーを取得

1. [TMDB](https://www.themoviedb.org/) のアカウントを作成（無料）
2. [Settings → API](https://www.themoviedb.org/settings/api) を開く
3. 「API Key (v3 auth)」を申請・発行し、コピー → `TMDB_API_KEY`

### 2. LINE Developers でアクセストークン & シークレットを取得

1. [LINE Developers Console](https://developers.line.biz/console/) にログイン
2. プロバイダーを作成し、その中に **Messaging API チャネル** を作成
3. **「Messaging API」タブ**：一番下の **「チャネルアクセストークン（長期）」** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
4. **「チャネル基本設定」タブ**：**「チャネルシークレット」** をコピー → `LINE_CHANNEL_SECRET`

### 3.（推奨）Gemini と Upstash を用意

- **Gemini**: [Google AI Studio](https://aistudio.google.com/apikey) で API キーを発行 → `GEMINI_API_KEY`
- **Upstash Redis**: [Upstash](https://upstash.com/) で Redis データベースを作成し、**REST API** の URL とトークンをコピー → `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`

### 4. Vercel に環境変数を設定してデプロイ

1. このリポジトリを GitHub に push し、[Vercel](https://vercel.com/) で Import（または `vercel` CLI でデプロイ）
2. Vercel の **Settings → Environment Variables** に上記の値を登録（Production / Preview 両方推奨）
3. **Deploy**。`vercel.json` の `crons`（`0 1 * * *` UTC = **10:00 JST**）により `/api/cron` が毎日自動実行されます
   - ※ Vercel Cron は Hobby プランだと「1 日 1 回」まで。本構成は 1 日 1 回なので OK

> 環境変数を後から追加・変更した場合は再デプロイが必要です。

### 5. LINE 側の Webhook 設定

1. LINE Developers Console → 対象チャネル → **「Messaging API」タブ**
2. **Webhook URL** に `https://<project>.vercel.app/api/webhook` を設定（`<project>` は実際の Vercel ドメイン）
3. **「Webhookの利用」を ON**
4. **「応答メッセージ（自動応答メッセージ）」を OFF**（LINE Official Account Manager の「応答設定」からも 応答メッセージ＝オフ / Webhook＝オン に）
5. （任意）「Verify」ボタンで疎通確認

これで友だち追加したユーザーが「今公開」で公開中の映画を受け取り、毎朝 10 時に新作のお知らせが届き、「感想…」で感想を記録でき、それ以外の言葉には執事 Sebas が応対します。

---

## ローカル開発・動作確認

- **起動**: `npm run dev`（= `vercel dev`）。`.env.example` を `.env` にコピーして値を設定
- **構文チェック**: 依存ゼロなのでビルド不要。`node --check <file>` で各ファイルを検査できる
- **cron を手動で叩く**（`CRON_SECRET` 未設定なら）：
  ```bash
  curl https://<project>.vercel.app/api/cron
  ```
  `CRON_SECRET` 設定時：
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" https://<project>.vercel.app/api/cron
  ```
- **webhook の署名検証を一時的に外す**（デバッグ時のみ）：`VERIFY_SIGNATURE=false` を設定して再デプロイ。確認後は必ず戻すこと

---

## 新機能を足すには

1. `features/_template.js` をコピーして `features/<機能名>.js` を作る
2. `name` / `match(text)` / `handle(event, ctx)` を実装する（`ctx` = `{ event, reply, gemini, store, butlerPrompt }`）
3. `features/index.js` の `features` 配列に登録する（**具体的なトリガーほど前、`butler` は必ず最後**）
4. [`docs/FEATURES.md`](docs/FEATURES.md) の表を更新する。環境変数を増やしたら `.env.example` と [`CLAUDE.md`](CLAUDE.md) も更新

`api/webhook.js` 本体は原則編集しません。外部依存パッケージは入れず、素の `fetch` と Node 標準モジュールで実装します。

---

## 注意

- `broadcast` は **全友だち** に送られます。テスト時はチャネルの友だちを絞るなど慎重に
- Flex カルーセルは最大 12 件まで表示します
- 感想は Upstash 未設定だと保存されません（取得は常に空配列を返す安全動作）
