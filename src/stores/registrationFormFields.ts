import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'
import type { FormField, FieldOption } from '@/types'

export const useRegistrationFormFieldsStore = defineStore('registrationFormFields', () => {
    const fields = ref<FormField[]>([])
    const loading = ref(false)
    const saving = ref(false)
    const error = ref<string | null>(null)
    const currentPageId = ref<number | null>(null)

    function clearError() { error.value = null }

    /**
     * 取得指定報名頁的所有欄位（含隱藏）
     */
    async function fetchFields(pageId: number) {
        loading.value = true
        clearError()
        try {
            const res = await apiRequest(`/api/registration-form-fields/by_page/${pageId}/`)
            if (!res.ok) throw new Error(`取得欄位失敗 (${res.status})`)
            const data: FormField[] = await res.json()
            // 就地修改陣列而非替換，確保 vuedraggable 能正確偵測變更
            fields.value.splice(0, fields.value.length, ...data)
            currentPageId.value = pageId
        } catch (err) {
            error.value = (err as Error).message
            console.error('fetchFields error:', err)
        } finally {
            loading.value = false
        }
    }

    /**
     * 整張欄位清單一次儲存（bulk_save）
     */
    async function bulkSave(pageId: number, fieldList: FormField[]) {
        saving.value = true
        clearError()
        try {
            const payload = {
                registration_page: pageId,
                fields: fieldList.map((f, index) => ({
                    id: f.id ?? null,
                    label: f.label,
                    field_type: f.field_type,
                    is_required: f.is_required ?? false,
                    is_hidden: f.is_hidden ?? false,
                    is_fixed: f.is_fixed ?? false,
                    order: index,
                    options: (f.options || []).map((opt: FieldOption, optIndex: number) => ({
                        text: opt.text,
                        order: optIndex,
                    })),
                })),
            }
            const res = await apiRequest('/api/registration-form-fields/bulk_save/', {
                method: 'POST',
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                let msg = `儲存失敗 (${res.status})`
                try { const e = await res.json(); msg = e.detail || JSON.stringify(e) } catch { /* ignore */ }
                throw new Error(msg)
            }
            fields.value = await res.json()
            currentPageId.value = pageId
            return fields.value
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            saving.value = false
        }
    }

    function clearFields() {
        fields.value = []
        currentPageId.value = null
        error.value = null
    }

    return {
        fields,
        loading,
        saving,
        error,
        currentPageId,
        fetchFields,
        bulkSave,
        clearFields,
    }
})
