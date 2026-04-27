import { onMounted, watch } from 'vue'
import { useEventsStore } from '@/stores/events'

interface UseEventScopedLoaderOptions {
  immediate?: boolean
  onNoEvent?: () => void | Promise<void>
}

export function useEventScopedLoader(
  load: (eventId: number) => void | Promise<void>,
  options: UseEventScopedLoaderOptions = {},
) {
  const eventsStore = useEventsStore()

  const loadForEvent = async (eventId?: number | null) => {
    if (!eventId) {
      await options.onNoEvent?.()
      return
    }

    await load(eventId)
  }

  const loadCurrentEvent = () => loadForEvent(eventsStore.currentEvent?.id)

  if (options.immediate !== false) {
    onMounted(() => {
      void loadCurrentEvent()
    })
  }

  watch(() => eventsStore.currentEvent?.id, (id, prevId) => {
    if (id === prevId) return
    void loadForEvent(id)
  })

  return {
    loadCurrentEvent,
  }
}