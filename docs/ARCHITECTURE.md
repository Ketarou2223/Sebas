# アーキテクチャ

執事ボット Sebas は **features レジストリ方式** を採用している。機能の追加は「`features/` に1ファイル足して `features/index.js` に登録する」だけで完結し、ルーター（`api/webhook.js`）は触らない。

## ディレクトリ構成

```
api/
  webhook.js     # LINE webhook の薄いルーター（署名検証 → ルーティングのみ。本体は編集しない）
  cron.js        # 朝のご挨拶 push の起動口。認証だけ行い実処理は features/morning.js を import
  movie-push.js  # 映画 push の起動口。認証だけ行い実処理は features/movie.js（pushTodayReleases）を import
features/
  index.js       # 全機能のレジストリ。features 配列（movie → review → butler）と fallback をエクスポート
  movie.js       # 映画機能（公開中一覧 + push 用 pushTodayReleases）
  morning.js     # 朝のご挨拶（push 専用）。挨拶＋天気の進言を1通で配信。index.js には登録せず cron から pushMorningGreeting を呼ぶ
  review.js      # 感想の記録 / 振り返り / おすすめ判定（store + gemini）
  butler.js      # 自由文の執事雑談（match 常時 true の高機能フォールバック・末尾登録）
  _template.js   # 新機能のひな形（コピーして使う。index.js には登録しない）
lib/
  line.js        # 署名検証 / reply / broadcast（node:crypto + fetch）
  tmdb.js        # TMDB 取得系（JST 当日算出 / discover / now_playing）
  weather.js     # Open-Meteo 取得（APIキー不要・固定座標）。当日の気温/降水確率/UV/概況
  messages.js    # Flex カルーセル等の LINE メッセージ生成
  gemini.js      # Gemini 文章生成の共通基盤（fetch のみ）
  store.js       # Upstash Redis REST の共通基盤（未設定なら no-op）
  memory.js      # 会話メモリ（短期バッファ + 長期メモ + 要約）。Upstash 未設定なら no-op
  persona.js     # 執事 Sebas のシステムプロンプト（人格・口調 + 記憶の発露ルール）
docs/
  ARCHITECTURE.md  # このファイル
  FEATURES.md      # 機能の目次（表）
CLAUDE.md        # 開発ルール・引き継ぎ資料
vercel.json      # スキーマのみ（時刻管理は外部 cron に移行したため crons は持たない）
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

## プッシュ配信（外部 cron）の流れ

**時刻管理は Vercel 内蔵 Cron から外部 cron（cron-job.org）に移行**した。Vercel 側のエンドポイントは
時刻を持たず、`CRON_SECRET` 認証だけを行う。外部 cron が2つのエンドポイントを**別々の時刻**で叩く。

- `GET /api/cron`（**6:30 JST 想定**）… 朝のご挨拶＋天気の進言（テキスト1通）
- `GET /api/movie-push`（**12:00 JST 想定**）… その日公開の新作（Flex。0件なら無配信）

どちらも `Authorization: Bearer <CRON_SECRET>` を検証し、不一致は 401。

```
外部 cron（cron-job.org など）
   │  GET /api/cron（6:30 JST 想定 / Authorization: Bearer <CRON_SECRET>）
   ▼
api/cron.js  ── 認証だけ行う（NG → 401）
   │  import { pushMorningGreeting } from features/morning.js
   ▼
features/morning.js: pushMorningGreeting()
   ├─ lib/weather.js で当日の天気を取得（失敗時は null → 挨拶のみ）
   ├─ 天気の数値（気温・降水確率・UV）を Gemini に渡し、執事 Sebas として
   │   「おはようございます」から始まる挨拶＋軽い進言（服装・傘・日焼け止め等）を生成
   └─ lib/line.js broadcast でテキスト1通を全友だちへ配信 → { ok, weather }

外部 cron（cron-job.org など）
   │  GET /api/movie-push（12:00 JST 想定 / Authorization: Bearer <CRON_SECRET>）
   ▼
api/movie-push.js  ── 認証だけ行う（NG → 401）
   │  import { pushTodayReleases } from features/movie.js
   ▼
features/movie.js: pushTodayReleases()
   ├─ lib/tmdb.js（getTodayReleasesJP）で本日 日本公開の新作を取得
   ├─ 新作ゼロ → 何も配信せず { broadcasted:false, count:0 }
   └─ あり → lib/line.js broadcast でポスター付き Flex を全友だちへ配信
```

進言のトーン：数値を読み上げるのではなく、主人が今日どう過ごすべきかを軽く提案する。該当する
ものだけ自然に触れ、フラットで簡潔に・くどくしない（具体ルールは `features/morning.js`）。

> push エンドポイントを足したら、外部 cron 側にもジョブ（URL ＋ `Authorization` ヘッダ）の登録が別途必要。

## 会話メモリ（記憶の保持と発露）

`lib/memory.js` が、ユーザー（`userId`）単位で2層の記憶を持つ。設計の肝は **「保持」と「発露」を分けること**。保持は memory.js が担い、発露（会話に出すか）は `lib/persona.js` のシステムプロンプトと各 feature の文脈注入が制御する。

### データ構造（Upstash Redis）

```
conv:{userId}   # 短期バッファ：直近の生発話を RPUSH したリスト
                #   ["ご主人様: 〜", "Sebas: 〜", ...]（1往復 = 2エントリ）
                #   要約が走るとクリアされる揮発的な作業領域

memo:{userId}   # 長期メモ：主人の人物像・関心事を JSON 文字列で1キーに保存
                #   [{ topic, summary, recordedAt, updatedAt }]
                #   recordedAt/updatedAt は "YYYY-MM-DD"
```

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 未設定時は全関数が安全に no-op（バッファ空・メモ空配列・書き込みなし）。

### フロー（バッファ → 7往復 → 要約 → 長期メモ）

```
butler.handle(event, ctx)
  ├─ 応答前: getMemo / getBuffer を読み、system プロンプトへ“参考情報”として同梱
  │           （発露するかは persona のルールに従い、普段は持ち出さない）
  ├─ ctx.gemini で応答生成 → ctx.reply
  └─ 応答後: pushTurn(userId, 本文, 返信) でバッファに1往復追記
              └─ maybeSummarize(userId, gemini)
                   ├─ バッファ < 7往復(14エントリ) → 何もしない
                   └─ 7往復たまった →
                        既存の長期メモ(JSON) + 短期バッファ(生ログ) + 今日の日付 を
                        Gemini(gemini-3.5-flash) に渡し、更新後のメモ JSON のみを得る
                        ├─ parse 成功 → setMemo(更新メモ) → clearBuffer
                        └─ parse/通信 失敗 → メモもバッファも保持して次回再試行
```

要約時のシステム指示の要点：人物像・感情・継続的な関心事を項目で管理／変化があれば `updatedAt` を今日に・矛盾は新しい方で上書き／**項目数が15を超えそうなら削除でなく「統合」を優先**（同一対象の時系列は期間と要点を残して1項目に畳む）／人間関係・感情・進行中の関心事を優先的に残す。

`features/review.js` の判定モードも `getMemo` を読み、好み判定の軽い補助に使う（記録・振り返りは従来どおり）。
