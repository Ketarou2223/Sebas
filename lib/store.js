// lib/store.js
// 永続ストレージの共通基盤。Upstash Redis の REST API を素の fetch で叩く。
// （@upstash/redis などの SDK は使わない方針）
//
// 現状はまだどの機能からも本格利用していない「土台」。
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN が未設定なら
// すべての操作は安全に no-op（get は null を返す）になるため、未設定でも他機能は壊れない。

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** ストア（Upstash）が利用可能か（環境変数が揃っているか）。 */
function enabled() {
  return Boolean(REST_URL && REST_TOKEN);
}

/**
 * Upstash REST のコマンドエンドポイントへ ["SET", key, value] 形式で1コマンド送る。
 * 未設定時は null を返して何もしない。
 * @param {string[]} args Redis コマンドと引数の配列
 * @returns {Promise<any>} Upstash のレスポンス result
 */
async function command(args) {
  if (!enabled()) return null;

  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upstash ${args[0]} failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.result;
}

/**
 * 共通ストア。各 feature には ctx.store として渡される。
 * 値は文字列前提（オブジェクトを入れたい場合は呼び出し側で JSON 文字列化する）。
 */
export const store = {
  /** ストアが有効か（環境変数が設定済みか）。 */
  enabled,

  /** キーの値を取得。無ければ null。ストア未設定時も null。 */
  async get(key) {
    return command(['GET', key]);
  },

  /**
   * キーに値を保存。ttlSeconds を渡すと有効期限付き（EX）で保存する。
   * @param {string} key
   * @param {string} value
   * @param {{ ttlSeconds?: number }} [opts]
   */
  async set(key, value, opts = {}) {
    const args = opts.ttlSeconds
      ? ['SET', key, value, 'EX', String(opts.ttlSeconds)]
      : ['SET', key, value];
    return command(args);
  },

  /** キーを削除。 */
  async del(key) {
    return command(['DEL', key]);
  },

  /**
   * ユーザーの映画感想を1件追記する（Redis のリストに RPUSH）。
   * 値は JSON 文字列化して保存する。ストア未設定時は no-op（保存されない）。
   * @param {string} userId LINE のユーザーID（event.source.userId）
   * @param {{ title?: string, comment?: string }} review 保存する感想
   */
  async addReview(userId, review) {
    if (!userId) return null;
    return command(['RPUSH', `reviews:${userId}`, JSON.stringify(review)]);
  },

  /**
   * ユーザーの映画感想を古い順にすべて取得する（LRANGE 0 -1）。
   * ストア未設定時・未記録時は空配列を返す。壊れた要素は読み飛ばす。
   * @param {string} userId LINE のユーザーID
   * @returns {Promise<Array<{ title?: string, comment?: string }>>}
   */
  async getReviews(userId) {
    if (!userId) return [];
    const items = await command(['LRANGE', `reviews:${userId}`, '0', '-1']);
    if (!Array.isArray(items)) return [];
    return items
      .map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  },
};
