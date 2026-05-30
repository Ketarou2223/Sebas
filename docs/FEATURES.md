# 機能一覧（FEATURES）

執事ボット Sebas の機能目次。**機能を追加・変更したら、この表を必ず更新すること**（CLAUDE.md の開発ルール参照）。

状態の凡例: 🟢 稼働 / 🟡 予定（土台のみ・未実装） / ⚪ 残置（通常は到達しない保険）

| 機能名 | トリガー | 概要 | 対応ファイル | 状態 |
| --- | --- | --- | --- | --- |
| movie（公開中一覧） | 「今公開」「公開中」「上映中」「いま公開」「今上映」「今やってる」を含むメッセージ | 現在 日本で劇場公開中の映画をポスター付き Flex カルーセルで返信 | `features/movie.js`（`handle`）, `lib/tmdb.js`, `lib/messages.js` | 🟢 |
| 朝のご挨拶（push） | `GET /api/cron`（外部 cron が起動。**6:30 JST 想定**） | 執事の朝のご挨拶＋天気からの軽い進言（服装・傘・日焼け止め等）をテキスト1通で broadcast。天気取得失敗時は挨拶のみ。映画は含まない（別エンドポイントに分離） | `features/morning.js`（`pushMorningGreeting`）, `api/cron.js`, `lib/weather.js`, `lib/gemini.js`, `lib/persona.js` | 🟢 |
| 映画プッシュ（push） | `GET /api/movie-push`（外部 cron が起動。**12:00 JST 想定**） | その日 日本で劇場公開される新作をポスター付き Flex で全友だちへ broadcast。新作ゼロの日は配信しない（`{ ok, broadcasted, count }` を返す） | `features/movie.js`（`pushTodayReleases`）, `api/movie-push.js`, `lib/tmdb.js`, `lib/messages.js` | 🟢 |
| review（感想の記録） | 「感想」で始まるメッセージ | 本文を Gemini に渡してタイトルと感想を抽出（JSON）し、ユーザーごとに保存。執事口調で記録完了を返信 | `features/review.js`（記録モード）, `lib/gemini.js`, `lib/store.js`（`addReview`） | 🟢 |
| review（感想の振り返り） | 「感想一覧」「履歴」「観た映画」を含むメッセージ | 保存済みの感想を「・タイトル：感想」の一覧で返信（Gemini は呼ばずトークン節約）。0件なら案内 | `features/review.js`（振り返りモード）, `lib/store.js`（`getReviews`） | 🟢 |
| review（おすすめ判定） | 「おすすめ」「観るべき」「見るべき」を含むメッセージ | 過去の感想を踏まえ、問い合わせ作品が好みに合うか執事 Sebas として Gemini が 2〜3 文で判定。感想0件なら案内 | `features/review.js`（判定モード）, `lib/gemini.js`, `lib/store.js`（`getReviews`）, `lib/persona.js` | 🟢 |
| butler（執事の雑談） | どの機能にも当たらないすべてのテキスト（`match` 常時 true・登録末尾） | 執事人格（`BUTLER_PROMPT`）で自由文に応答する高機能フォールバック。Gemini 失敗時はお詫びの定型文。他機能の案内も自然に添える。応答前に長期メモ・直近バッファを文脈注入し、応答後にバッファ更新→7往復で要約を発火 | `features/butler.js`, `lib/gemini.js`, `lib/persona.js`, `lib/memory.js` | 🟢 |
| 会話メモリ（記憶） | （トリガーなし・横断基盤）butler の各応答に付随して動作 | ユーザー単位で「短期バッファ（直近の生発話）」と「長期メモ（人物像・関心事の JSON）」を保持。7往復たまると Gemini が要約して長期メモを更新（15項目超過時は削除でなく統合）。**発露は抑制的**：保持はするが、persona のルールにより話題が関連したときだけ自然に触れる。Upstash 未設定時は安全に no-op | `lib/memory.js`, `lib/persona.js`, `lib/gemini.js`, `features/butler.js`, `features/review.js`（判定の軽い補助） | 🟢 |
| fallback（ヘルプ/案内） | （実質未到達）butler が末尾で全テキストを受けるため通常呼ばれない | 将来 butler を外した場合の保険として使い方案内を残置 | `features/index.js`（`fallback`）, `lib/messages.js` | ⚪ |

## 今後の追加予定（土台のみ）

基盤（`lib/`）だけ用意済みで未実装の候補。追加時にこの表へ行を足すこと。
※「執事の雑談」（→ `features/butler.js`）と「感想の記録」（→ `features/review.js`）は実装済みのため上の稼働表へ移動した。

| 候補 | 使う基盤 | メモ | 状態 |
| --- | --- | --- | --- |
| （現時点で土台のみの候補はなし） | — | — | — |

## 新機能の追加手順（要約）

1. `features/_template.js` をコピーして `features/<機能名>.js` を作る。
2. `name` / `match(text)` / `handle(event, ctx)` を実装する。
3. `features/index.js` の `features` 配列に登録する（具体的なトリガーほど前に置く）。
4. **この FEATURES.md の表に行を追加する。** 環境変数を増やしたなら `.env.example` と `CLAUDE.md` も更新。
