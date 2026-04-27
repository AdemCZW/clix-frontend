import { ref } from 'vue'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

const visible = ref(false)
const options = ref<ConfirmOptions>({ message: '' })

let _resolve: ((value: boolean) => void) | null = null

function confirm(opts: ConfirmOptions | string): Promise<boolean> {
  _resolve?.(false)
  options.value = typeof opts === 'string' ? { message: opts, danger: true } : { danger: true, ...opts }
  visible.value = true
  return new Promise<boolean>((resolve) => {
    _resolve = resolve
  })
}

function handleConfirm() {
  visible.value = false
  _resolve?.(true)
  _resolve = null
}

function handleCancel() {
  visible.value = false
  _resolve?.(false)
  _resolve = null
}

export function useConfirm() {
  return {
    visible,
    options,
    confirm,
    handleConfirm,
    handleCancel,
  }
}
