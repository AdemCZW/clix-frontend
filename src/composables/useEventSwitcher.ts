import { useRouter, type RouteLocationRaw } from 'vue-router'
import { useEventsStore } from '@/stores/events'
import { useUserStore } from '@/stores/user'
import type { Event } from '@/types'

export function useEventSwitcher() {
  const router = useRouter()
  const eventsStore = useEventsStore()
  const userStore = useUserStore()

  /**
   * 切換當前活動，可選擇導航到指定路由
   */
  const switchEvent = (event: Event, to?: RouteLocationRaw) => {
    eventsStore.setCurrentEvent(event, userStore.user?.id)
    if (to) router.push(to)
  }

  return { switchEvent }
}
