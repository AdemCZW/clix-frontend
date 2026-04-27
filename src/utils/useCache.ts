import { ref } from 'vue'

/**
 * TTL-based 快取 helper
 *
 * 用法：
 *   const cache = useCache(30_000)          // 30 秒 TTL
 *   if (cache.isValid('event_5')) return     // 命中快取 → 跳過 fetch
 *   // ... 執行 fetch ...
 *   cache.touch('event_5')                   // 更新快取時間戳
 *   cache.invalidate()                       // 手動清除快取
 */
export function useCache(ttl = 30_000) {
  const _lastFetched = ref(0)
  const _lastKey = ref('')

  /** 檢查快取是否仍有效 */
  function isValid(key = ''): boolean {
    return _lastKey.value === key && Date.now() - _lastFetched.value < ttl
  }

  /** 標記剛完成 fetch */
  function touch(key = '') {
    _lastFetched.value = Date.now()
    _lastKey.value = key
  }

  /** 手動使快取失效 */
  function invalidate() {
    _lastFetched.value = 0
    _lastKey.value = ''
  }

  return { isValid, touch, invalidate }
}
