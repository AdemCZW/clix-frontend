import { ref, watch, type Ref } from 'vue'

/**
 * 對 ref 值做 debounce，延遲 delay 毫秒後才更新
 * 用法：const debouncedSearch = useDebouncedRef(searchQuery, 300)
 */
export function useDebouncedRef<T>(source: Ref<T>, delay = 300): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (val) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = val
    }, delay)
  })

  return debounced
}
