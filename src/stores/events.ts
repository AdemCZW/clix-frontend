import { ref } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import type { Event, RawEvent } from '@/types'

export const useEventsStore = defineStore('events', () => {
    const events = ref<Event[]>([])
    const currentEvent = ref<Event | null>(null)
    const storageUserId = ref<number | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    // ── 快取 ──────────────────────────────────────────────────────────────
    const CACHE_TTL = 60_000 // 60 秒
    const _lastFetched = ref(0)
    const _lastFetchedKey = ref('')

    const getStorageKey = (userId: number | null) => (userId ? `current_event__${userId}` : 'current_event')

    const setStorageUserId = (userId: number | null | undefined) => {
        storageUserId.value = userId ?? null
    }

    /**
     * 將後端資料欄位對應到前端格式
     */
    const mapEvent = (e: RawEvent): Event => ({
        id: e.id,
        name: e.name || '',
        banner: e.banner || null,
        date: e.date || '',
        endDate: e.end_date || e.date || '',
        // 後端回傳 HH:MM:SS，前端只用 HH:MM
        time: e.time ? e.time.slice(0, 5) : '',
        location: e.location || '',
        address: e.address || '',
        isPublished: e.is_published || false,
        hasRegistrationPage: e.has_registration_page || false,
        guestsCount: e.guests_count || 0,
        participantsCount: e.participants_count || 0,
        // 顯示用欄位（優先使用後端回傳的 status / status_text）
        participants: e.participants_count || 0,
        status: e.status || (e.is_published ? 'active' : 'upcoming'),
        statusText: e.status_text || (e.is_published ? '進行中' : '即將開始'),
    })

    /**
     * 將 payload 物件轉成 FormData（後端含 banner 欄位，使用 multipart/form-data）
     */
    const toFormData = (payload: Record<string, unknown>) => {
        const fd = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
            if (val === null || val === undefined) return
            if (val instanceof File) {
                fd.append(key, val)
            } else if (typeof val === 'boolean') {
                fd.append(key, val ? 'true' : 'false')
            } else {
                fd.append(key, String(val))
            }
        })
        return fd
    }

    /**
     * 取得活動列表 GET /api/events/
     */
    const fetchEvents = async (options: { userId?: number; isSuperAdmin?: boolean } = {}) => {
        const cacheKey = `${options.userId}_${options.isSuperAdmin}`
        if (events.value.length > 0 && _lastFetchedKey.value === cacheKey && Date.now() - _lastFetched.value < CACHE_TTL) return
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/events/')
            if (!res.ok) throw new Error('取得活動列表失敗')
            const data = await res.json()
            const list: RawEvent[] = data.results || data

            const resolveOwnerId = (e: RawEvent): number | null => {
                if (typeof e.owner === 'number') return e.owner
                if (e.owner?.id) return e.owner.id
                if (typeof e.owner_id === 'number') return e.owner_id
                if (typeof e.created_by === 'number') return e.created_by
                if (e.created_by?.id) return e.created_by.id
                if (typeof e.created_by_id === 'number') return e.created_by_id
                return null
            }

            const resolveManagerIds = (e: RawEvent): number[] => {
                const raw = e.managers || e.manager_ids || e.members || e.member_ids
                if (!Array.isArray(raw)) return []
                return raw
                    .map((m) => (typeof m === 'number' ? m : m?.id))
                    .filter((id): id is number => typeof id === 'number')
            }

            const { userId, isSuperAdmin } = options
            const filtered = !isSuperAdmin && userId
                ? list.filter((e) => {
                    const ownerId = resolveOwnerId(e)
                    const managerIds = resolveManagerIds(e)
                    if (ownerId === null && managerIds.length === 0) return true
                    return ownerId === userId || managerIds.includes(userId)
                })
                : list

            events.value = filtered.map(mapEvent)
            _lastFetched.value = Date.now()
            _lastFetchedKey.value = cacheKey
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 取得單一活動 GET /api/events/{id}/
     */
    const fetchEvent = async (id: number): Promise<Event> => {
        const res = await apiRequest(`/api/events/${id}/`)
        if (!res.ok) {
            const err = new Error(res.status === 404 ? 'NOT_FOUND' : '取得活動資料失敗')
            ;(err as Error & { status: number }).status = res.status
            throw err
        }
        return mapEvent(await res.json())
    }

    /**
     * 建立活動 POST /api/events/  → multipart/form-data
     */
    const createEvent = async (payload: Record<string, unknown>): Promise<Event> => {
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/events/', {
                method: 'POST',
                body: toFormData(payload),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `建立活動失敗 (${res.status})`))
            const created = mapEvent(await res.json())
            events.value.unshift(created)
            return created
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 更新活動 PATCH /api/events/{id}/  → multipart/form-data
     */
    const updateEvent = async (id: number, payload: Record<string, unknown>): Promise<Event> => {
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/events/${id}/`, {
                method: 'PATCH',
                body: toFormData(payload),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `更新活動失敗 (${res.status})`))
            const updated = mapEvent(await res.json())
            const idx = events.value.findIndex((e) => e.id === id)
            if (idx > -1) events.value[idx] = updated
            return updated
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 設定目前活動，並持久化到 localStorage
     */
    const setCurrentEvent = (event: Event | null, userId?: number) => {
        if (userId !== undefined) setStorageUserId(userId)
        currentEvent.value = event
        const storageKey = getStorageKey(storageUserId.value)
        if (!event) {
            localStorage.removeItem(storageKey)
        } else {
            localStorage.setItem(storageKey, JSON.stringify(event))
        }
    }

    const clearCurrentEvent = (userId?: number) => {
        if (userId !== undefined) setStorageUserId(userId)
        currentEvent.value = null
        localStorage.removeItem(getStorageKey(storageUserId.value))
    }

    /**
     * 重新產生短連結 POST /api/events/{id}/regenerate_link/
     */
    const regenerateShortLink = async (id: number): Promise<string> => {
        const res = await apiRequest(`/api/events/${id}/regenerate_link/`, { method: 'POST' })
        if (!res.ok) {
            const err = new Error('重新產生短連結失敗')
            ;(err as Error & { status: number }).status = res.status
            throw err
        }
        const data: { short_link?: string; shortLink?: string } = await res.json()
        const newLink = data.short_link || data.shortLink || ''
        // 同步更新 events 列表與 currentEvent
        const idx = events.value.findIndex((e) => e.id === id)
        if (idx > -1) events.value[idx] = { ...events.value[idx], shortLink: newLink }
        if (currentEvent.value?.id === id) {
            currentEvent.value = { ...currentEvent.value, shortLink: newLink }
            localStorage.setItem(getStorageKey(storageUserId.value), JSON.stringify(currentEvent.value))
        }
        return newLink
    }

    /**
     * 刪除活動 DELETE /api/events/{id}/
     */
    const deleteEvent = async (id: number) => {
        const res = await apiRequest(`/api/events/${id}/`, { method: 'DELETE' })
        if (!res.ok && res.status !== 204) {
            const err = new Error(`刪除活動失敗 (${res.status})`)
            ;(err as Error & { status: number }).status = res.status
            throw err
        }
        events.value = events.value.filter((e) => e.id !== id)
        if (currentEvent.value?.id === id) setCurrentEvent(null, storageUserId.value ?? undefined)
    }

    /**
     * 從 localStorage 恢復上次選擇的活動
     */
    const initFromStorage = (userId: number) => {
        setStorageUserId(userId)
        const stored = localStorage.getItem(getStorageKey(storageUserId.value))
        if (stored) {
            try { currentEvent.value = JSON.parse(stored) } catch { /* ignore */ }
        } else {
            currentEvent.value = null
        }
    }

    return {
        events,
        currentEvent,
        isLoading,
        error,
        fetchEvents,
        fetchEvent,
        createEvent,
        updateEvent,
        setCurrentEvent,
        clearCurrentEvent,
        regenerateShortLink,
        deleteEvent,
        initFromStorage,
    }
})
