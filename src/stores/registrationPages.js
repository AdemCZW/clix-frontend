import { ref } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'

/**
 * 後端欄位 → 前端 camelCase
 */
function mapPage(page) {
    return {
        id: page.id,
        eventId: page.event,
        eventName: page.event_name || '',
        eventDate: page.event_date || '',
        eventLocation: page.event_location || '',
        banner: page.banner || null, // URL 或 null
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

/**
 * 將表單資料轉成 FormData 或純 JSON payload
 * 如果有 bannerFile（File 物件）就用 multipart，否則用 JSON
 */
function buildPatchPayload(formData) {
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
    const payload = {}
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
    const currentPage = ref(null)
    const loading = ref(false)
    const error = ref(null)

    /**
     * 取得活動對應的報名頁設定
     * GET /api/registration-pages/by_event/{eventId}/
     * 若尚未建立（404）回傳 null
     */
    async function fetchByEvent(eventId) {
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
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 建立報名頁設定（第一次進入設定頁時自動呼叫）
     * POST /api/registration-pages/
     */
    async function createPage(eventId, data = {}) {
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
                let msg = `建立報名頁設定失敗 (${res.status})`
                try {
                    const e = await res.json();
                    msg = e.detail || JSON.stringify(e)
                } catch { /* ignore */ }
                error.value = msg
                throw new Error(msg)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 儲存草稿
     * PATCH /api/registration-pages/{pageId}/
     * 若有 bannerFile 使用 multipart/form-data，否則使用 JSON
     */
    async function saveDraft(pageId, formData) {
        loading.value = true
        error.value = null
        try {
            const { body } = buildPatchPayload(formData)
            const res = await apiRequest(`/api/registration-pages/${pageId}/`, {
                method: 'PATCH',
                body,
            })
            if (!res.ok) {
                let msg = `儲存失敗 (${res.status})`
                try {
                    const e = await res.json();
                    msg = e.detail || JSON.stringify(e)
                } catch { /* ignore */ }
                error.value = msg
                throw new Error(msg)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 發布
     * POST /api/registration-pages/{pageId}/publish/
     */
    async function publish(pageId) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/publish/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) {
                let msg = `發布失敗 (${res.status})`
                try {
                    const e = await res.json();
                    msg = e.detail || JSON.stringify(e)
                } catch { /* ignore */ }
                error.value = msg
                throw new Error(msg)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 取消發布（存為草稿）
     * POST /api/registration-pages/{pageId}/unpublish/
     */
    async function unpublish(pageId) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/unpublish/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) {
                let msg = `取消發布失敗 (${res.status})`
                try {
                    const e = await res.json();
                    msg = e.detail || JSON.stringify(e)
                } catch { /* ignore */ }
                error.value = msg
                throw new Error(msg)
            }
            currentPage.value = mapPage(await res.json())
            return currentPage.value
        } catch (err) {
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 重新產生短連結
     * POST /api/registration-pages/{pageId}/regenerate_link/
     * 回傳新的 shortLink 字串
     */
    async function regenerateLink(pageId) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/regenerate_link/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) {
                const err = new Error(`重新產生短連結失敗 (${res.status})`)
                err.status = res.status
                error.value = err.message
                throw err
            }
            const data = await res.json()
            const newLink = data.short_link || ''
            if (currentPage.value) currentPage.value.shortLink = newLink
            return newLink
        } catch (err) {
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    /**
     * 刪除報名頁設定
     * DELETE /api/registration-pages/{pageId}/
     */
    async function deletePage(pageId) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/registration-pages/${pageId}/`, { method: 'DELETE' })
            if (!res.ok && res.status !== 204) {
                const err = new Error(`刪除失敗 (${res.status})`)
                error.value = err.message
                throw err
            }
            currentPage.value = null
        } catch (err) {
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    function clearError() { error.value = null }

    function clear() {
        currentPage.value = null;
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
