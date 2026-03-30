import { apiRequest } from '@/utils/api'

/**
 * Quill 編輯器圖片上傳 handler
 * 攔截 Quill 的圖片插入，上傳到後端取得 URL，取代 base64
 *
 * 用法：
 * const quillRef = ref()
 * onMounted(() => setupQuillImageUpload(quillRef.value))
 */
export function setupQuillImageUpload(quillEditor: any) {
  if (!quillEditor) return

  const quill = quillEditor.getQuill?.() || quillEditor
  if (!quill) return

  const toolbar = quill.getModule('toolbar')
  if (!toolbar) return

  toolbar.addHandler('image', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/gif,image/webp'

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      // 限制 5MB
      if (file.size > 5 * 1024 * 1024) {
        alert('圖片大小不能超過 5MB')
        return
      }

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await apiRequest('/api/upload/image/', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => null)
          alert(err?.detail || '圖片上傳失敗')
          return
        }

        const data = await res.json()
        const range = quill.getSelection(true)
        quill.insertEmbed(range.index, 'image', data.url)
        quill.setSelection(range.index + 1)
      } catch {
        alert('圖片上傳失敗，請檢查網路連線')
      }
    }

    input.click()
  })
}
