import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'

export const useAdminAccountsStore = defineStore('adminAccounts', () => {
    const adminAccounts = ref([])
    const staffAccounts = ref([])
    const loading = ref(false)

    // ----- 資料格式轉換（API snake_case → 前端 camelCase）-----

    const mapManager = (m) => ({
        id: m.id,
        email: m.email,
        staffQuota: m.staff_quota != null ? m.staff_quota : 0,
        staffCount: m.staff_count != null ? m.staff_count : 0,
        isActive: m.is_active,
        createdAt: m.date_joined ? m.date_joined.split('T')[0] : '',
    })

    const mapStaff = (s) => ({
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
        loading.value = true
        try {
            const res = await apiRequest('/api/managers/')
            if (!res.ok) throw new Error('無法取得管理者列表')
            const data = await res.json()
            // 支援分頁格式 { results: [...] } 和純陣列兩種回傳
            const list = Array.isArray(data) ? data : (data.results || [])
            adminAccounts.value = list.map(mapManager)
        } finally {
            loading.value = false
        }
    }

    const fetchStaff = async () => {
        loading.value = true
        try {
            const res = await apiRequest('/api/staff/')
            if (!res.ok) throw new Error('無法取得員工列表')
            const data = await res.json()
            // 支援分頁格式 { results: [...] } 和純陣列兩種回傳
            const list = Array.isArray(data) ? data : (data.results || [])
            staffAccounts.value = list.map(mapStaff)
        } finally {
            loading.value = false
        }
    }

    // ----- 計算工具 -----

    const getStaffCountByAdmin = (adminId) => {
        return staffAccounts.value.filter((s) => s.managerId === adminId).length
    }

    const canAddStaff = (adminId) => {
        const admin = adminAccounts.value.find((a) => a.id === adminId)
        if (!admin) return false
        return getStaffCountByAdmin(adminId) < admin.staffQuota
    }

    // ----- 管理者 CRUD -----

    const createManager = async (email, password, staffQuota) => {
        const res = await apiRequest('/api/managers/', {
            method: 'POST',
            body: JSON.stringify({ email, password, staff_quota: staffQuota }),
        })
        if (!res.ok) {
            const err = await res.json()
            const msg = (err.email && err.email[0]) || err.detail || '新增管理者失敗'
            throw new Error(msg)
        }
        const data = await res.json()
        adminAccounts.value.push(mapManager(data))
        return data
    }

    const deleteAdmin = async (adminId) => {
        const res = await apiRequest('/api/managers/' + adminId + '/', { method: 'DELETE' })
        if (!res.ok) throw new Error('刪除管理者失敗')
        staffAccounts.value = staffAccounts.value.filter((s) => s.managerId !== adminId)
        adminAccounts.value = adminAccounts.value.filter((a) => a.id !== adminId)
    }

    const updateAdminQuota = async (adminId, newQuota) => {
        const res = await apiRequest('/api/managers/' + adminId + '/', {
            method: 'PATCH',
            body: JSON.stringify({ staff_quota: newQuota }),
        })
        if (!res.ok) throw new Error('更新配額失敗')
        const data = await res.json()
        const admin = adminAccounts.value.find((a) => a.id === adminId)
        if (admin) admin.staffQuota = data.staff_quota
    }

    // ----- 員工 CRUD -----

    const addStaff = async (managerId, password) => {
        if (!canAddStaff(managerId)) {
            throw new Error('已達員工額度上限')
        }
        const res = await apiRequest('/api/staff/', {
            method: 'POST',
            body: JSON.stringify({ manager: managerId, password }),
        })
        if (!res.ok) {
            const err = await res.json()
            const msg = err.detail || (err.password && err.password[0]) || '新增員工失敗'
            throw new Error(msg)
        }
        const data = await res.json()
        const newStaff = mapStaff(data)
        staffAccounts.value.push(newStaff)
        return newStaff
    }

    const deleteStaff = async (staffId) => {
        const res = await apiRequest('/api/staff/' + staffId + '/', { method: 'DELETE' })
        if (!res.ok) throw new Error('刪除員工失敗')
        staffAccounts.value = staffAccounts.value.filter((s) => s.id !== staffId)
    }

    const getStaffByManager = (managerId) => {
        return staffAccounts.value.filter((s) => s.managerId === managerId)
    }

    return {
        adminAccounts,
        staffAccounts,
        loading,
        getStaffCountByAdmin,
        canAddStaff,
        fetchManagers,
        fetchStaff,
        createManager,
        deleteAdmin,
        updateAdminQuota,
        addStaff,
        deleteStaff,
        getStaffByManager,
    }
})
