import { ref, watchEffect } from 'vue'

const LS_KEY = 'app-theme'
const theme = ref<'light' | 'dark'>((localStorage.getItem(LS_KEY) as any) || 'light')

export function useTheme() {
  const toggle = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem(LS_KEY, theme.value)
  }

  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value)
  })

  return { theme, toggle }
}
