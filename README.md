# LINE 映画ボット 🎬

LINE 公式アカウント用の映画ボット。TMDB をデータソースに、Vercel Serverless Functions で動きます。

- **機能① 公開日プッシュ（cron）**：毎朝 **10:00 JST** に「その日 日本で劇場公開される新作」を全友だちへ配信
- **機能② 公開中一覧（webhook）**：「今公開」「公開中」「上映中」等のメッセージに、現在公開中の映画をポスター付き Flex カルーセルで返信
- **機能③ Gemini**：`lib/gemini.js` に雛形（スタブ + サンプルコメント）のみ。本体には未組み込み

## 技術スタック / 方針

- Node.js 18+ / Vercel Serverless Functions（`/api` 配下）
- 依存パッケージなし。グローバル `fetch` と `node:crypto` のみで完結（LINE SDK 不使用）
- DB なし（ユーザー設定の保存なし）
- 全 TMDB リクエストは `region=JP` / `language=ja-JP` 固定

## ファイル構成

```
api/
  cron.js          # 機能①: 公開日プッシュ（Vercel Cron）
  webhook.js       # 機能②: LINE webhook（raw body 読取 + 署名検証）
lib/
  tmdb.js          # TMDB 取得系（JST 当日算出 / discover / now_playing）
  line.js          # 署名検証 / reply / broadcast
  messages.js      # Flex カルーセル生成
  gemini.js        # スタブ（未使用）
vercel.json        # Cron 設定（"0 1 * * *" = 10:00 JST）
package.json
.env.example
```

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `TMDB_API_KEY` | ✅ | TMDB の API キー（v3 auth の API Key） |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINE Messaging API のチャネルアクセストークン（長期） |
| `LINE_CHANNEL_SECRET` | ✅ | LINE チャネルシークレット（webhook 署名検証に使用） |
| `CRON_SECRET` | 任意 | 設定すると `/api/cron` が `Authorization: Bearer <CRON_SECRET>` を要求。Vercel Cron は自動付与する |
| `VERIFY_SIGNATURE` | 任意 | `"false"` で webhook の署名検証をスキップ（デバッグ専用）。本番では未設定のまま |

---

## セットアップ手順

### 1. TMDB API キーを取得

1. [TMDB](https://www.themoviedb.org/) のアカウントを作成（無料）
2. [Settings → API](https://www.themoviedb.org/settings/api) を開く
3. 「API Key (v3 auth)」を申請・発行
4. 発行された **API Key (v3 auth)** をコピー → これが `TMDB_API_KEY`

### 2. LINE Developers でアクセストークン & シークレットを取得

1. [LINE Developers Console](https://developers.line.biz/console/) にログイン
2. プロバイダーを作成し、その中に **Messaging API チャネル** を作成
3. **「Messaging API」タブ**：
   - 一番下の **「チャネルアクセストークン（長期）」** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
4. **「チャネル基本設定」タブ**：
   - **「チャネルシークレット」** をコピー → `LINE_CHANNEL_SECRET`

### 3. Vercel に環境変数を設定してデプロイ

1. このリポジトリを GitHub に push し、[Vercel](https://vercel.com/) で Import（または `vercel` CLI でデプロイ）
2. Vercel プロジェクトの **Settings → Environment Variables** に以下を登録（Production / Preview 両方推奨）：
   - `TMDB_API_KEY`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - （任意）`CRON_SECRET` … Cron 保護したい場合
3. **Deploy**。デプロイ後、`vercel.json` の `crons` 設定により毎日 `0 1 * * *`（UTC）＝ **10:00 JST** に `/api/cron` が自動実行されます
   - ※ Vercel Cron は Hobby プランだと「1 日 1 回」まで。本構成は 1 日 1 回なので OK

> 環境変数を後から追加・変更した場合は再デプロイが必要です。

### 4. LINE 側の Webhook 設定

1. LINE Developers Console → 対象チャネル → **「Messaging API」タブ**
2. **Webhook URL** に以下を設定：
   ```
   https://<project>.vercel.app/api/webhook
   ```
   （`<project>` は実際の Vercel ドメインに置き換え）
3. **「Webhookの利用」を ON**
4. **「応答メッセージ（自動応答メッセージ）」を OFF**
   - LINE Official Account Manager の「応答設定」からも、**応答メッセージ＝オフ / Webhook＝オン** にしておく
5. （任意）「Verify」ボタンで疎通確認

これで、友だち追加したユーザーが「今公開」などと送ると公開中の映画が返り、毎朝 10 時には新作公開のお知らせが届きます。

---

## 動作確認のヒント

- **cron を手動で叩く**（`CRON_SECRET` 未設定なら）：
  ```bash
  curl https://<project>.vercel.app/api/cron
  ```
  `CRON_SECRET` 設定時：
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" https://<project>.vercel.app/api/cron
  ```
- **webhook の署名検証を一時的に外す**（デバッグ時のみ）：環境変数 `VERIFY_SIGNATURE=false` を設定して再デプロイ。確認後は必ず戻すこと。
- 新作公開がない日は cron は何も配信しません（`broadcasted: false`）。

## 注意

- `broadcast` は **全友だち** に送られます。テスト時はチャネルの友だちを絞るか、`VERIFY_SIGNATURE` / `CRON_SECRET` を使って慎重に。
- Flex カルーセルは最大 12 件まで表示します。
