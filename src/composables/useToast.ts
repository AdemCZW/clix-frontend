import { ref } from 'vue'
import type { ToastType, ToastState } from '@/types'

const toastState = ref<ToastState>({
    show: false,
    message: '',
    type: 'info',
    duration: 3000
})

export function useToast() {
    const showToast = (message: string, type: ToastType = 'info', duration = 3000) => {
        toastState.value = {
            show: true,
            message,
            type,
            duration
        }
    }

    const success = (message: string, duration = 3000) => {
        showToast(message, 'success', duration)
    }

    const error = (message: string, duration = 3000) => {
        showToast(message, 'error', duration)
    }

    const warning = (message: string, duration = 3000) => {
        showToast(message, 'warning', duration)
    }

    const info = (message: string, duration = 3000) => {
        showToast(message, 'info', duration)
    }

    return {
        toastState,
        showToast,
        success,
        error,
        warning,
        info
    }
}
