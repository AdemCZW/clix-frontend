import { ref } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import { useStoreRequest } from '@/utils/useStoreRequest'
import { compressImage } from '@/utils/imageCompress'
import { toFormData } from '@/utils/formData'
import type { RegistrationPage, RawRegistrationPage, FormField } from '@/types'

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

async function buildPatchPayload(formData: PageFormData): Promise<{ body: FormData | string }> {
    if (formData.bannerFile instanceof File) {
        const compressedBannerFile = await compressImage(formData.bannerFile)
        const fd = toFormData({
            banner: compressedBannerFile,
            main_content: formData.mainContent,
            email_subject: formData.emailSubject,
            email_sender_name: formData.emailSenderName,
            email_content: formData.emailContent,
            enable_auto_send: formData.enableAutoSend,
            form_fields: formData.formFields !== undefined ? JSON.stringify(formData.formFields) : undefined,
        })
        return { body: fd }
    }
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
    const { loading, error, run, clearError } = useStoreRequest()

    const fetchByEvent = (eventId: number) =>
        run(async () => {
            const res = await apiRequest(`/api/registration-pages/by_event/${eventId}/`)
            if (res.status === 404) { currentPage.value = null; return null }
            if (!res.ok) throw new Error(`取得報名頁設定失敗 (${res.status})`)
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        })

    const createPage = (eventId: number, data: Partial<PageFormData> = {}) =>
        run(async () => {
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
            if (!res.ok) throw new Error(await parseApiError(res, `建立報名頁設定失敗 (${res.status})`))
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        })

    const saveDraft = (pageId: number, formData: PageFormData) =>
        run(async () => {
            const { body } = await buildPatchPayload(formData)
            const res = await apiRequest(`/api/registration-pages/${pageId}/`, {
                method: 'PATCH',
                body,
            })
            if (!res.ok) throw new Error(await parseApiError(res, `儲存失敗 (${res.status})`))
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        })

    const publish = (pageId: number) =>
        run(async () => {
            const res = await apiRequest(`/api/registration-pages/${pageId}/publish/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `發布失敗 (${res.status})`))
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        })

    const unpublish = (pageId: number) =>
        run(async () => {
            const res = await apiRequest(`/api/registration-pages/${pageId}/unpublish/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `取消發布失敗 (${res.status})`))
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        })

    const regenerateLink = (pageId: number) =>
        run(async () => {
            const res = await apiRequest(`/api/registration-pages/${pageId}/regenerate_link/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) throw new Error(`重新產生短連結失敗 (${res.status})`)
            const data: { short_link?: string } = await res.json()
            const newLink = data.short_link || ''
            if (currentPage.value) currentPage.value.shortLink = newLink
            return newLink
        })

    const deletePage = (pageId: number) =>
        run(async () => {
            const res = await apiRequest(`/api/registration-pages/${pageId}/`, { method: 'DELETE' })
            if (!res.ok && res.status !== 204) throw new Error(`刪除失敗 (${res.status})`)
            currentPage.value = null
        })

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
