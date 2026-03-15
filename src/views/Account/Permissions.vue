<template>
  <div v-if="isSuperAdmin" class="account-view">
    <!-- 載入中遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner">載入中...</div>
    </div>

    <div class="two-panel-layout">
      <!-- 左側：管理者列表 -->
      <div class="left-panel">
        <div class="panel-header">
          <h2 class="panel-title">管理者</h2>
          <button class="btn-add-small" @click="showAddAdminModal = true" title="新增管理者">
            +
          </button>
        </div>

        <div class="admin-list">
          <div
            v-for="admin in adminAccounts"
            :key="admin.id"
            class="admin-item"
            :class="{ active: selectedAdminId === admin.id }"
            @click="selectAdmin(admin.id)"
          >
            <div class="admin-item-header">
              <span class="admin-email-small">{{ admin.email }}</span>
              <button class="btn-delete-small" @click.stop="deleteAdmin(admin.id)" title="刪除">
                ×
              </button>
            </div>
            <div class="admin-item-info">
              <span class="quota-badge">
                員工 {{ getStaffCountByAdmin(admin.id) }}/{{ admin.staffQuota }}
              </span>
              <button class="btn-quota-small" @click.stop="openEditQuotaModal(admin)">
                調整額度
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右側：員工帳戶 -->
      <div class="right-panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">員工帳戶</h2>
            <p v-if="selectedAdmin" class="panel-subtitle">{{ selectedAdmin.email }} 的員工列表</p>
            <p v-else class="panel-subtitle-hint">← 請先選擇管理者</p>
          </div>
          <button
            v-if="selectedAdmin"
            class="btn-primary"
            @click="showAddStaffModal = true"
            :disabled="!canAddStaff(selectedAdminId)"
          >
            <span class="btn-icon">+</span>
            新增員工
          </button>
        </div>

        <div v-if="selectedAdmin" class="staff-content">
          <div v-if="selectedAdminStaff.length === 0" class="empty-state">
            <div class="empty-icon">👥</div>
            <p class="empty-text">尚未新增員工帳戶</p>
            <button
              class="btn-primary"
              @click="showAddStaffModal = true"
              :disabled="!canAddStaff(selectedAdminId)"
            >
              新增第一個員工
            </button>
          </div>

          <div v-else class="table-container">
            <table class="staff-table">
              <thead>
                <tr>
                  <th>員工帳號</th>
                  <th>建立日期</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="staff in selectedAdminStaff" :key="staff.id">
                  <td>
                    <div class="account-id-cell">
                      <span class="account-id">{{ staff.accountId }}</span>
                      <button class="btn-copy" @click="copyToClipboard(staff.accountId)">
                        複製
                      </button>
                    </div>
                  </td>
                  <td>{{ staff.createdAt }}</td>
                  <td>
                    <span class="status-badge" :class="staff.status">
                      {{ staff.status === "active" ? "啟用" : "停用" }}
                    </span>
                  </td>
                  <td>
                    <button class="btn-action-delete" @click="deleteStaff(staff.id)">刪除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else class="no-selection">
          <p class="no-selection-text">請從左側選擇一個管理者</p>
        </div>
      </div>
    </div>

    <!-- 新增管理者 Modal -->
    <BaseModal v-model="showAddAdminModal" title="新增管理者帳戶">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input
          v-model="newAdmin.email"
          type="email"
          class="form-input"
          placeholder="example@company.com"
        />
      </div>
      <div class="form-group">
        <label class="form-label">密碼</label>
        <input
          v-model="newAdmin.password"
          type="password"
          class="form-input"
          placeholder="設定登入密碼"
        />
      </div>
      <div class="form-group">
        <label class="form-label">確認密碼</label>
        <input
          v-model="newAdmin.confirmPassword"
          type="password"
          class="form-input"
          placeholder="再次輸入密碼"
        />
      </div>
      <div class="form-group">
        <label class="form-label">員工配額</label>
        <input
          v-model.number="newAdmin.staffQuota"
          type="number"
          class="form-input"
          placeholder="可建立員工帳戶數量"
          min="1"
        />
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showAddAdminModal = false">取消</button>
        <button class="btn-primary" @click="submitAddAdmin">確認新增</button>
      </template>
    </BaseModal>

    <!-- 新增員工 Modal -->
    <BaseModal v-model="showAddStaffModal" title="新增員工帳戶">
      <div class="form-group">
        <label class="form-label">所屬管理者</label>
        <div class="selected-manager-display">
          {{ selectedAdmin.email }}
          <span class="quota-info">
            ({{ getStaffCountByAdmin(selectedAdminId) }}/{{ selectedAdmin.staffQuota }})
          </span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">員工帳號</label>
        <div class="auto-id-display">
          <span class="id-prefix">ST</span>
          <span class="id-number">##### (系統自動產生)</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">密碼</label>
        <input
          v-model="newStaff.password"
          type="password"
          class="form-input"
          placeholder="設定登入密碼"
        />
      </div>
      <div class="form-group">
        <label class="form-label">確認密碼</label>
        <input
          v-model="newStaff.confirmPassword"
          type="password"
          class="form-input"
          placeholder="再次輸入密碼"
        />
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showAddStaffModal = false">取消</button>
        <button class="btn-primary" @click="addStaff">確認新增</button>
      </template>
    </BaseModal>

    <!-- 調整配額 Modal -->
    <BaseModal v-model="showEditQuotaModal" title="調整員工配額">
      <div class="form-group">
        <label class="form-label">管理者</label>
        <div class="info-display">{{ editingAdmin?.email }}</div>
      </div>
      <div class="form-group">
        <label class="form-label">目前使用數</label>
        <div class="info-display">
          {{ editingAdmin ? getStaffCountByAdmin(editingAdmin.id) : 0 }} 位員工
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">新配額</label>
        <input
          v-model.number="editQuotaValue"
          type="number"
          class="form-input"
          :min="editingAdmin ? getStaffCountByAdmin(editingAdmin.id) : 0"
          placeholder="不可低於目前使用數"
        />
      </div>
      <template #footer>
        <button class="btn-secondary" @click="showEditQuotaModal = false">取消</button>
        <button class="btn-primary" @click="saveQuota">確認修改</button>
      </template>
    </BaseModal>
  </div>
  <div v-else class="no-permission">
    <p>您沒有權限檢視此頁面</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useAdminAccountsStore } from "@/stores/adminAccounts";
import { useUserStore } from "@/stores/user";
import { storeToRefs } from "pinia";
import { useToast } from "@/composables/useToast";
import BaseModal from "@/components/shared/BaseModal.vue";

const { success, error, warning } = useToast();

const userStore = useUserStore();
const { isSuperAdmin } = storeToRefs(userStore);

const adminStore = useAdminAccountsStore();
const { adminAccounts, staffAccounts, loading } = storeToRefs(adminStore);

onMounted(async () => {
  try {
    await Promise.all([adminStore.fetchManagers(), adminStore.fetchStaff()]);
  } catch (err) {
    error(err.message || "載入資料失敗");
  }
});

const selectedAdminId = ref(null);

const showAddAdminModal = ref(false);
const showAddStaffModal = ref(false);
const showEditQuotaModal = ref(false);

const newAdmin = ref({
  email: "",
  password: "",
  confirmPassword: "",
  staffQuota: 5,
});

const newStaff = ref({
  password: "",
  confirmPassword: "",
});

const editingAdmin = ref(null);
const editQuotaValue = ref(0);

const getStaffCountByAdmin = adminStore.getStaffCountByAdmin;
const canAddStaff = adminStore.canAddStaff;

const selectAdmin = (adminId) => {
  selectedAdminId.value = adminId;
};

const selectedAdmin = computed(() => {
  return adminAccounts.value.find((admin) => admin.id === selectedAdminId.value);
});

const selectedAdminStaff = computed(() => {
  if (!selectedAdminId.value) return [];
  return staffAccounts.value.filter((staff) => staff.managerId === selectedAdminId.value);
});

const submitAddAdmin = async () => {
  if (!newAdmin.value.email || !newAdmin.value.password || !newAdmin.value.confirmPassword) {
    warning("請填寫所有必填欄位");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newAdmin.value.email)) {
    error("請輸入有效的 Email 格式");
    return;
  }

  if (adminAccounts.value.some((admin) => admin.email === newAdmin.value.email)) {
    error("此 Email 已被使用");
    return;
  }

  if (newAdmin.value.password !== newAdmin.value.confirmPassword) {
    error("密碼與確認密碼不一致");
    return;
  }

  if (!newAdmin.value.staffQuota || newAdmin.value.staffQuota < 1) {
    warning("請設定員工配額（至少 1 位）");
    return;
  }

  try {
    await adminStore.createManager(
      newAdmin.value.email,
      newAdmin.value.password,
      newAdmin.value.staffQuota,
    );
    showAddAdminModal.value = false;
    newAdmin.value = { email: "", password: "", confirmPassword: "", staffQuota: 5 };
    success("管理者帳戶已建立");
  } catch (err) {
    error(err.message);
  }
};

const addStaff = async () => {
  if (!selectedAdminId.value || !newStaff.value.password || !newStaff.value.confirmPassword) {
    warning("請填寫所有必填欄位");
    return;
  }

  if (newStaff.value.password !== newStaff.value.confirmPassword) {
    error("密碼與確認密碼不一致");
    return;
  }

  if (newStaff.value.password.length < 8) {
    error("密碼至少需要 8 個字元");
    return;
  }

  const admin = adminAccounts.value.find((a) => a.id === selectedAdminId.value);
  if (!admin) {
    error("找不到指定的管理者");
    return;
  }

  if (!canAddStaff(selectedAdminId.value)) {
    warning("該管理者的員工額度已滿");
    return;
  }

  try {
    const newStaffAccount = await adminStore.addStaff(
      selectedAdminId.value,
      newStaff.value.password,
    );
    success(`員工帳號已建立！帳號：${newStaffAccount.accountId}`);
    showAddStaffModal.value = false;
    newStaff.value = { password: "", confirmPassword: "" };
  } catch (err) {
    error(err.message);
  }
};

const deleteAdmin = async (adminId) => {
  const staffCount = getStaffCountByAdmin(adminId);
  const admin = adminAccounts.value.find((a) => a.id === adminId);

  let confirmMessage = "";
  if (staffCount > 0) {
    confirmMessage = `刪除管理者 ${admin.email} 將同時刪除 ${staffCount} 位員工帳戶，確定要繼續嗎？`;
  } else {
    confirmMessage = `確定要刪除管理者 ${admin.email} 嗎？`;
  }

  if (!window.confirm(confirmMessage)) return;

  try {
    await adminStore.deleteAdmin(adminId);
    success("管理者已刪除");
    if (selectedAdminId.value === adminId) selectedAdminId.value = null;
  } catch (err) {
    error(err.message);
  }
};

const deleteStaff = async (staffId) => {
  const staff = staffAccounts.value.find((s) => s.id === staffId);
  if (!window.confirm(`確定要刪除員工帳號 ${staff.accountId} 嗎？`)) return;

  try {
    await adminStore.deleteStaff(staffId);
    success("員工帳號已刪除");
  } catch (err) {
    error(err.message);
  }
};
const openEditQuotaModal = (admin) => {
  editingAdmin.value = admin;
  editQuotaValue.value = admin.staffQuota;
  showEditQuotaModal.value = true;
};

const saveQuota = async () => {
  if (!editingAdmin.value) return;

  const currentUsage = getStaffCountByAdmin(editingAdmin.value.id);

  if (editQuotaValue.value < currentUsage) {
    warning(`新配額不可低於目前使用數 (${currentUsage})`);
    return;
  }

  try {
    await adminStore.updateAdminQuota(editingAdmin.value.id, editQuotaValue.value);
    success("配額已更新");
    showEditQuotaModal.value = false;
    editingAdmin.value = null;
  } catch (err) {
    error(err.message);
  }
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    success("帳號已複製到剪貼簿");
  });
};
</script>

<style scoped lang="scss">
.account-view {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.two-panel-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
  min-height: calc(100vh - 240px);
}

.left-panel {
  background: white;
  border-radius: 16px;
  padding: 24px;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  height: fit-content;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #f1f5f9;
}

.panel-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.panel-subtitle {
  font-size: 0.9rem;
  color: #475569;
  margin: 4px 0 0 0;
}

.panel-subtitle-hint {
  font-size: 0.9rem;
  color: #475569;
  margin: 4px 0 0 0;
}

.btn-add-small {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }
}

.admin-list {
  flex: 1;
  overflow-y: auto;
  margin: -4px;
  padding: 4px;
  max-height: 600px;
}

.admin-item {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
    transform: translateX(4px);
  }

  &.active {
    background: #eff6ff;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.admin-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.admin-email-small {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.btn-delete-small {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: #fee2e2;
  color: #dc2626;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;

  &:hover {
    background: #fca5a5;
    transform: scale(1.1);
  }
}

.admin-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quota-badge {
  font-size: 0.75rem;
  padding: 4px 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #475569;
  font-weight: 600;
}

.btn-quota-small {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: white;
  color: #475569;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  font-weight: 600;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
    background: #eff6ff;
  }
}

.right-panel {
  background: white;
  border-radius: 16px;
  padding: 28px;
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  min-height: 500px;

  .panel-header {
    margin-bottom: 24px;
  }
}

.staff-content {
  flex: 1;
  overflow-y: auto;
}

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.no-selection-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.4;
}

.no-selection-text {
  font-size: 1rem;
  margin: 0;
  color: #475569;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 72px;
  margin-bottom: 20px;
  opacity: 0.3;
}

.empty-text {
  font-size: 1rem;
  color: #475569;
  margin: 0 0 24px 0;
}

.table-container {
  overflow-x: auto;
}

.staff-table {
  width: 100%;
  border-collapse: collapse;

  thead {
    background: #f8fafc;

    th {
      padding: 14px 18px;
      text-align: left;
      font-size: 0.85rem;
      font-weight: 700;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }

  tbody {
    tr {
      border-bottom: 1px solid #f1f5f9;
      transition: all 0.2s;

      &:hover {
        background: #f8fafc;
      }

      td {
        padding: 16px 18px;
        font-size: 0.9rem;
        color: #0f172a;
      }
    }
  }
}

.account-id-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-id {
  font-family: "SF Mono", "Monaco", "Courier New", monospace;
  font-weight: 700;
  color: #0f172a;
  font-size: 0.9rem;
}

.btn-copy {
  padding: 5px 10px;
  border: none;
  background: #f1f5f9;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;

  &:hover {
    background: #e2e8f0;
    transform: scale(1.05);
  }
}

.status-badge {
  padding: 5px 14px;
  border-radius: 16px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.active {
    background: #dcfce7;
    color: #166534;
  }

  &.inactive {
    background: #fee2e2;
    color: #991b1b;
  }
}

.btn-action-delete {
  padding: 7px 14px;
  border: 2px solid #fecaca;
  background: white;
  color: #dc2626;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    transform: translateY(-1px);
  }
}

.btn-primary {
  padding: 11px 22px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-secondary {
  padding: 11px 22px;
  border: 2px solid #cbd5e1;
  border-radius: 10px;
  background: white;
  color: #475569;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: #64748b;
    background: #f8fafc;
    color: #334155;
  }
}

.btn-icon {
  font-size: 18px;
}

.form-group {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 10px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.9rem;
  color: #0f172a;
  transition: all 0.3s;
  background: #f8fafc;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
    background: white;
  }

  &::placeholder {
    color: #475569;
  }
}

.selected-manager-display {
  padding: 12px 16px;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.9rem;
  color: #0f172a;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;

  .quota-info {
    color: #475569;
    font-size: 0.85rem;
    font-weight: 500;
  }
}

.auto-id-display {
  padding: 12px 16px;
  background: #fefce8;
  border: 2px dashed #fcd34d;
  border-radius: 10px;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;

  .id-prefix {
    font-family: "SF Mono", "Monaco", "Courier New", monospace;
    font-weight: 800;
    color: #0f172a;
  }

  .id-number {
    font-family: "SF Mono", "Monaco", "Courier New", monospace;
    color: #475569;
    font-weight: 600;
  }
}

.info-display {
  padding: 12px 16px;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  font-size: 0.9rem;
  color: #0f172a;
  font-weight: 600;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;

  .loading-spinner {
    background: white;
    padding: 16px 32px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    font-weight: 600;
    color: #374151;
  }
}

/* ====== RWD ====== */
@media (max-width: 768px) {
  .account-view {
    padding: 16px;
  }

  .two-panel-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .left-panel {
    padding: 16px;
  }

  .admin-list {
    max-height: 300px;
  }

  .right-panel {
    padding: 16px;
    min-height: auto;
  }

  .staff-table {
    thead th {
      padding: 10px 12px;
      font-size: 0.75rem;
    }

    tbody tr td {
      padding: 12px;
      font-size: 0.8rem;
    }
  }

  .account-id-cell {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
