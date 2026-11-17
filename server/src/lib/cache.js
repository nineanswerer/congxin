/**
 * 进程内缓存 + **请求去重**。
 *
 * 官方把「请求缓存 + 请求去重」写成最佳实践（D17）。实测上游还有**秒级限流**
 * （Code=30001 second limit exceeded），所以去重不只是省额度，
 * 也是防止并发请求把上游打爆。
 *
 * 零数据库：全部放进程内 Map（D22）。
 */

const store = new Map();     // key -> { value, storedAt, expiresAt }
const inflight = new Map();  // key -> Promise（同一个 key 的并发请求合并成一次上游调用）

/**
 * 取缓存；未命中则调用 producer。
 * 返回 { ...value, cached, cacheAgeS }
 */
export async function cached(key, ttlMs, producer) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return { ...hit.value, cached: true, cacheAgeS: Math.round((now - hit.storedAt) / 1000) };
  }

  // 去重：同一个 key 已经有请求在飞，直接复用，不再打上游
  if (inflight.has(key)) {
    const p = inflight.get(key);
    const value = await p;
    return { ...value, cached: true, cacheAgeS: 0 };
  }

  const promise = (async () => {
    const value = await producer();
    const ts = Date.now();
    store.set(key, { value, storedAt: ts, expiresAt: ts + ttlMs });
    return value;
  })();

  inflight.set(key, promise);
  try {
    const value = await promise;
    return { ...value, cached: false, cacheAgeS: 0 };
  } finally {
    inflight.delete(key);
  }
}

/** 清空缓存（测试与调试用）。 */
export function clearCache() {
  store.clear();
  inflight.clear();
}

/** 缓存统计，给 /api/health 用。 */
export function cacheStats() {
  const now = Date.now();
  let live = 0;
  for (const v of store.values()) if (v.expiresAt > now) live += 1;
  return { entries: store.size, live, inflight: inflight.size };
}
