import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAdminAccountsStore = defineStore('adminAccounts', () => {
    // 管理者帳戶
    const adminAccounts = ref([
        { id: 1, email: 'admin1@company.com', staffQuota: 10, createdAt: '2024-01-15' },
        { id: 2, email: 'admin2@company.com', staffQuota: 5, createdAt: '2024-01-20' }
    ]);

    // 員工帳戶
    const staffAccounts = ref([{
            id: 1,
            accountId: 'ST12345',
            managerId: 1,
            managerEmail: 'admin1@company.com',
            createdAt: '2024-01-16',
            status: 'active'
        },
        {
            id: 2,
            accountId: 'ST67890',
            managerId: 1,
            managerEmail: 'admin1@company.com',
            createdAt: '2024-01-17',
            status: 'active'
        },
        {
            id: 3,
            accountId: 'ST24680',
            managerId: 2,
            managerEmail: 'admin2@company.com',
            createdAt: '2024-01-21',
            status: 'active'
        }
    ]);

    // 計算每個管理者的員工數量
    const getStaffCountByAdmin = (adminId) => {
        return staffAccounts.value.filter(s => s.managerId === adminId).length;
    };

    // 檢查是否可以新增員工
    const canAddStaff = (adminId) => {
        const admin = adminAccounts.value.find(a => a.id === adminId);
        if (!admin) return false;
        const currentCount = getStaffCountByAdmin(adminId);
        return currentCount < admin.staffQuota;
    };

    // 新增管理者
    const addAdmin = (email, password, staffQuota) => {
        const newId = Math.max(...adminAccounts.value.map(a => a.id), 0) + 1;
        const newAdmin = {
            id: newId,
            email,
            staffQuota,
            createdAt: new Date().toISOString().split('T')[0]
        };
        adminAccounts.value.push(newAdmin);
        return newAdmin;
    };

    // 刪除管理者
    const deleteAdmin = (adminId) => {
        // 同時刪除該管理者的所有員工
        staffAccounts.value = staffAccounts.value.filter(s => s.managerId !== adminId);
        adminAccounts.value = adminAccounts.value.filter(a => a.id !== adminId);
    };

    // 更新管理者額度
    const updateAdminQuota = (adminId, newQuota) => {
        const admin = adminAccounts.value.find(a => a.id === adminId);
        if (admin) {
            admin.staffQuota = newQuota;
        }
    };

    // 新增員工
    const addStaff = (managerId) => {
        if (!canAddStaff(managerId)) {
            throw new Error('已達員工額度上限');
        }

        const manager = adminAccounts.value.find(a => a.id === managerId);
        const newId = Math.max(...staffAccounts.value.map(s => s.id), 0) + 1;
        const accountId = 'ST' + String(10000 + newId).substring(1);

        const newStaff = {
            id: newId,
            accountId,
            managerId,
            managerEmail: manager.email,
            createdAt: new Date().toISOString().split('T')[0],
            status: 'active'
        };

        staffAccounts.value.push(newStaff);
        return newStaff;
    };

    // 刪除員工
    const deleteStaff = (staffId) => {
        staffAccounts.value = staffAccounts.value.filter(s => s.id !== staffId);
    };

    // 根據管理者ID獲取員工列表
    const getStaffByManager = (managerId) => {
        return staffAccounts.value.filter(s => s.managerId === managerId);
    };

    return {
        adminAccounts,
        staffAccounts,
        getStaffCountByAdmin,
        canAddStaff,
        addAdmin,
        deleteAdmin,
        updateAdminQuota,
        addStaff,
        deleteStaff,
        getStaffByManager
    };
});
