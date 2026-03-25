import { ref } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import type { RegistrationPage, RawRegistrationPage, FormField } from '@/types'

/**
 * 後端欄位 → 前端 camelCase
 */
function mapPage(page: RawRegistrationPage): RegistrationPage {
    return {
        id: page.id,
        eventId: page.event,
        eventName: page.event_name || '',
        eventDate: page.event_date || '',
        eventLocation: page.event_location || '',
        banner: page.banner || null,
        shortLink: page.short_link || '',
        mainContent: page.main_content || '',
        emailSubject: page.email_subject || '',
        emailSenderName: page.email_sender_name || '',
        emailContent: page.email_content || '',
        enableAutoSend: page.enable_auto_send ?? true,
        isPublished: page.is_published || false,
        formFields: Array.isArray(page.form_fields) ? page.form_fields : [],
        createdAt: page.created_at || '',
        updatedAt: page.updated_at || '',
    }
}

interface PageFormData {
    bannerFile?: File | null
    mainContent?: string
    emailSubject?: string
    emailSenderName?: string
    emailContent?: string
    enableAutoSend?: boolean
    formFields?: FormField[]
    shortLink?: string
}

/**
 * 將表單資料轉成 FormData 或純 JSON payload
 */
function buildPatchPayload(formData: PageFormData): { body: FormData | string } {
    if (formData.bannerFile instanceof File) {
        const fd = new FormData()
        fd.append('banner', formData.bannerFile)
        if (formData.mainContent !== undefined) fd.append('main_content', formData.mainContent)
        if (formData.emailSubject !== undefined) fd.append('email_subject', formData.emailSubject)
        if (formData.emailSenderName !== undefined) fd.append('email_sender_name', formData.emailSenderName)
        if (formData.emailContent !== undefined) fd.append('email_content', formData.emailContent)
        if (formData.enableAutoSend !== undefined) fd.append('enable_auto_send', String(formData.enableAutoSend))
        if (formData.formFields !== undefined) fd.append('form_fields', JSON.stringify(formData.formFields))
        return { body: fd }
    }
    // 純 JSON — 只送有值的欄位
    const payload: Record<string, unknown> = {}
    if (formData.mainContent !== undefined) payload.main_content = formData.mainContent
    if (formData.emailSubject !== undefined) payload.email_subject = formData.emailSubject
    if (formData.emailSenderName !== undefined) payload.email_sender_name = formData.emailSenderName
    if (formData.emailContent !== undefined) payload.email_content = formData.emailContent
    if (formData.enableAutoSend !== undefined) payload.enable_auto_send = formData.enableAutoSend
    if (formData.formFields !== undefined) payload.form_fields = formData.formFields
    if (formData.shortLink !== undefined) payload.short_link = formData.shortLink
    return { body: JSON.stringify(payload) }
}

export const useRegistrationPagesStore = defineStore('registrationPages', () => {
    const currentPage = ref<RegistrationPage | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    /**
     * 取得活動對應的報名頁設定
     * GET /api/registration-pages/by_event/{eventId}/
     */
    async function fetchByEvent(eventId: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/by_event/${eventId}/`)
            if (res.status === 404) {
                currentPage.value = null
                return null
            }
            if (!res.ok) {
                const msg = `取得報名頁設定失敗 (${res.status})`
                error.value = msg
                throw new Error(msg)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 建立報名頁設定
     * POST /api/registration-pages/
     */
    async function createPage(eventId: number, data: Partial<PageFormData> = {}) {
        loading.value = true
        error.value = null
        try {
            const payload = {
                event: eventId,
                main_content: data.mainContent ?? '',
                email_subject: data.emailSubject ?? '【報名成功通知】感謝您參與本次活動',
                email_sender_name: data.emailSenderName ?? '活動主辦單位',
                email_content: data.emailContent ?? '<h2>親愛的 {name} 您好：</h2><p>感謝您報名參加 <strong>{event_name}</strong>。</p>',
                enable_auto_send: data.enableAutoSend ?? true,
                is_published: false,
            }
            const res = await apiRequest('/api/registration-pages/', {
                method: 'POST',
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                error.value = await parseApiError(res, `建立報名頁設定失敗 (${res.status})`)
                throw new Error(error.value)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 儲存草稿
     * PATCH /api/registration-pages/{pageId}/
     */
    async function saveDraft(pageId: number, formData: PageFormData) {
        loading.value = true
        error.value = null
        try {
            const { body } = buildPatchPayload(formData)
            const res = await apiRequest(`/api/registration-pages/${pageId}/`, {
                method: 'PATCH',
                body,
            })
            if (!res.ok) {
                error.value = await parseApiError(res, `儲存失敗 (${res.status})`)
                throw new Error(error.value)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 發布
     * POST /api/registration-pages/{pageId}/publish/
     */
    async function publish(pageId: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/publish/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) {
                error.value = await parseApiError(res, `發布失敗 (${res.status})`)
                throw new Error(error.value)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 取消發布（存為草稿）
     * POST /api/registration-pages/{pageId}/unpublish/
     */
    async function unpublish(pageId: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/unpublish/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) {
                error.value = await parseApiError(res, `取消發布失敗 (${res.status})`)
                throw new Error(error.value)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 重新產生短連結
     * POST /api/registration-pages/{pageId}/regenerate_link/
     */
    async function regenerateLink(pageId: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/regenerate_link/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) {
                error.value = `重新產生短連結失敗 (${res.status})`
                throw new Error(error.value)
            }
            const data: { short_link?: string } = await res.json()
            const newLink = data.short_link || ''
            if (currentPage.value) currentPage.value.shortLink = newLink
            return newLink
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 刪除報名頁設定
     * DELETE /api/registration-pages/{pageId}/
     */
    async function deletePage(pageId: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/`, { method: 'DELETE' })
            if (!res.ok && res.status !== 204) {
                error.value = `刪除失敗 (${res.status})`
                throw new Error(error.value)
            }
            currentPage.value = null
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    function clearError() { error.value = null }

    function clear() {
        currentPage.value = null
        error.value = null
    }

    return {
        currentPage,
        loading,
        error,
        fetchByEvent,
        createPage,
        saveDraft,
        publish,
        unpublish,
        regenerateLink,
        deletePage,
        clearError,
        clear,
    }
})
