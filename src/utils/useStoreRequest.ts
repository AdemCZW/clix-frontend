import { ref, type Ref } from 'vue'

/**
 * Store 通用 request 狀態管理
 *
 * 消除每個 store method 重複的 loading/error/try-catch/finally 樣板。
 *
 * 用法：
 *   const { loading, error, run } = useStoreRequest()
 *   const fetchGuests = (eventId: number) => run(async () => { ... })
 */
export function useStoreRequest() {
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    loading.value = true
    error.value = null
    try {
      return await fn()
    } catch (err) {
      error.value = (err as Error).message
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 靜默執行（不設 loading，不設 error，只拋錯） */
  async function runSilent<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  function clearError() {
    error.value = null
  }

  return { loading, error, run, runSilent, clearError }
}
