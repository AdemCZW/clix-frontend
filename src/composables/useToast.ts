import { ref } from 'vue'
import type { ToastType } from '@/types'

export interface ToastItem {
    id: number
    message: string
    type: ToastType
    duration: number
}

let _nextId = 0
const queue = ref<ToastItem[]>([])
const MAX_VISIBLE = 5

function push(message: string, type: ToastType = 'info', duration = 3000) {
    const id = ++_nextId
    queue.value.push({ id, message, type, duration })
    // 超過上限時移除最舊的
    if (queue.value.length > MAX_VISIBLE) {
        queue.value.splice(0, queue.value.length - MAX_VISIBLE)
    }
    setTimeout(() => dismiss(id), duration)
}

function dismiss(id: number) {
    const idx = queue.value.findIndex((t) => t.id === id)
    if (idx > -1) queue.value.splice(idx, 1)
}

export function useToast() {
    const success = (message: string, duration = 3000) => push(message, 'success', duration)
    const error   = (message: string, duration = 4000) => push(message, 'error', duration)
    const warning = (message: string, duration = 3500) => push(message, 'warning', duration)
    const info    = (message: string, duration = 3000) => push(message, 'info', duration)

    return {
        queue,
        dismiss,
        success,
        error,
        warning,
        info,
    }
}
