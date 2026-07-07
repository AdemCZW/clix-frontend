import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'
import { useStoreRequest } from '@/utils/useStoreRequest'
import { useCache } from '@/utils/useCache'
import type { Manager, RawManager, Staff, RawStaff } from '@/types'
import { formatDrfErrors } from '@/utils/parseApiError'

export const useAdminAccountsStore = defineStore('adminAccounts', () => {
    const adminAccounts = ref<Manager[]>([])
    const staffAccounts = ref<Staff[]>([])
    const { loading, error, run } = useStoreRequest()
    const managersCache = useCache(30_000)
    const staffCache = useCache(30_000)

    const mapManager = (m: RawManager): Manager => ({
        id: m.id,
        email: m.email,
        staffQuota: m.staff_quota != null ? m.staff_quota : 0,
        staffCount: m.staff_count != null ? m.staff_count : 0,
        isActive: m.is_active,
        createdAt: m.date_joined ? m.date_joined.split('T')[0] : '',
    })

    const mapStaff = (s: RawStaff): Staff => ({
        id: s.id,
        accountId: s.account_id,
        managerId: s.manager,
        managerEmail: s.manager_email,
        isActive: s.is_active,
        createdAt: s.date_joined ? s.date_joined.split('T')[0] : '',
        status: s.is_active ? 'active' : 'inactive',
    })

    // ----- 讀取資料 -----

    const fetchManagers = async () => {
        if (adminAccounts.value.length > 0 && managersCache.isValid()) return
        await run(async () => {
            const res = await apiRequest('/api/managers/')
            if (!res.ok) throw new Error('無法取得管理者列表')
            const data = await res.json()
            const list: RawManager[] = Array.isArray(data) ? data : (data.results || [])
            adminAccounts.value = list.map(mapManager)
            managersCache.touch()
        })
    }

    const fetchStaff = async () => {
        if (staffAccounts.value.length > 0 && staffCache.isValid()) return
        await run(async () => {
            const res = await apiRequest('/api/staff/')
            if (!res.ok) throw new Error('無法取得員工列表')
            const data = await res.json()
            const list: RawStaff[] = Array.isArray(data) ? data : (data.results || [])
            staffAccounts.value = list.map(mapStaff)
            staffCache.touch()
        })
    }

    // ----- 計算工具 -----

    const getStaffCountByAdmin = (adminId: number) => {
        return staffAccounts.value.filter((s) => s.managerId === adminId).length
    }

    const canAddStaff = (adminId: number) => {
        const admin = adminAccounts.value.find((a) => a.id === adminId)
        if (!admin) return false
        return getStaffCountByAdmin(adminId) < admin.staffQuota
    }

    // ----- 管理者 CRUD -----

    const parseCreateError = async (res: Response, fallback: string) => {
        try {
            return formatDrfErrors(await res.json(), fallback)
        } catch {
            return fallback
        }
    }

    const addAdmin = async (email: string, password: string, staffQuota: number) => {
        return run(async () => {
            const res = await apiRequest('/api/managers/', {
                method: 'POST',
                body: JSON.stringify({ email, password, staff_quota: staffQuota }),
            })
            if (!res.ok) throw new Error(await parseCreateError(res, '新增管理者失敗'))
            const data: RawManager = await res.json()
            adminAccounts.value.push(mapManager(data))
            managersCache.invalidate()
            return data
        })
    }

    const deleteAdmin = async (adminId: number) => {
        return run(async () => {
            const res = await apiRequest('/api/managers/' + adminId + '/', { method: 'DELETE' })
            if (!res.ok) throw new Error('刪除管理者失敗')
            staffAccounts.value = staffAccounts.value.filter((s) => s.managerId !== adminId)
            adminAccounts.value = adminAccounts.value.filter((a) => a.id !== adminId)
            managersCache.invalidate()
            staffCache.invalidate()
        })
    }

    const updateAdminQuota = async (adminId: number, newQuota: number) => {
        return run(async () => {
            const res = await apiRequest('/api/managers/' + adminId + '/', {
                method: 'PATCH',
                body: JSON.stringify({ staff_quota: newQuota }),
            })
            if (!res.ok) throw new Error('更新配額失敗')
            const data: { staff_quota: number } = await res.json()
            const admin = adminAccounts.value.find((a) => a.id === adminId)
            if (admin) admin.staffQuota = data.staff_quota
            managersCache.invalidate()
        })
    }

    // ----- 員工 CRUD -----

    const addStaff = async (managerId: number, password: string) => {
        return run(async () => {
            if (!canAddStaff(managerId)) throw new Error('已達員工額度上限')
            const res = await apiRequest('/api/staff/', {
                method: 'POST',
                body: JSON.stringify({ manager: managerId, password }),
            })
            if (!res.ok) throw new Error(await parseCreateError(res, '新增員工失敗'))
            const data: RawStaff = await res.json()
            const newStaff = mapStaff(data)
            staffAccounts.value.push(newStaff)
            staffCache.invalidate()
            managersCache.invalidate()
            return newStaff
        })
    }

    const deleteStaff = async (staffId: number) => {
        return run(async () => {
            const res = await apiRequest('/api/staff/' + staffId + '/', { method: 'DELETE' })
            if (!res.ok) throw new Error('刪除員工失敗')
            staffAccounts.value = staffAccounts.value.filter((s) => s.id !== staffId)
            staffCache.invalidate()
            managersCache.invalidate()
        })
    }

    const getStaffByManager = (managerId: number) => {
        return staffAccounts.value.filter((s) => s.managerId === managerId)
    }

    return {
        adminAccounts,
        staffAccounts,
        loading,
        error,
        getStaffCountByAdmin,
        canAddStaff,
        fetchManagers,
        fetchStaff,
        addAdmin,
        deleteAdmin,
        updateAdminQuota,
        addStaff,
        deleteStaff,
        getStaffByManager,
    }
})
