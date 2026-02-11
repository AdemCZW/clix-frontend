<template>
  <div class="account-view">
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
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showAddAdminModal" class="modal-overlay" @click.self="showAddAdminModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3 class="modal-title">新增管理者帳戶</h3>
              <button class="btn-close" @click="showAddAdminModal = false">×</button>
            </div>
            <div class="modal-body">
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
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" @click="showAddAdminModal = false">取消</button>
              <button class="btn-primary" @click="addAdmin">確認新增</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 新增員工 Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showAddStaffModal" class="modal-overlay" @click.self="showAddStaffModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3 class="modal-title">新增員工帳戶</h3>
              <button class="btn-close" @click="showAddStaffModal = false">×</button>
            </div>
            <div class="modal-body">
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
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" @click="showAddStaffModal = false">取消</button>
              <button class="btn-primary" @click="addStaff">確認新增</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 調整配額 Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showEditQuotaModal"
          class="modal-overlay"
          @click.self="showEditQuotaModal = false"
        >
          <div class="modal-content">
            <div class="modal-header">
              <h3 class="modal-title">調整員工配額</h3>
              <button class="btn-close" @click="showEditQuotaModal = false">×</button>
            </div>
            <div class="modal-body">
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
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" @click="showEditQuotaModal = false">取消</button>
              <button class="btn-primary" @click="saveQuota">確認修改</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const selectedAdminId = ref(null);

const adminAccounts = ref([
  { id: 1, email: "admin1@company.com", staffQuota: 10, createdAt: "2024-01-15" },
  { id: 2, email: "admin2@company.com", staffQuota: 5, createdAt: "2024-01-20" },
]);

const staffAccounts = ref([
  {
    id: 1,
    accountId: "ST12345",
    managerId: 1,
    managerEmail: "admin1@company.com",
    createdAt: "2024-01-16",
    status: "active",
  },
  {
    id: 2,
    accountId: "ST67890",
    managerId: 1,
    managerEmail: "admin1@company.com",
    createdAt: "2024-01-17",
    status: "active",
  },
  {
    id: 3,
    accountId: "ST24680",
    managerId: 2,
    managerEmail: "admin2@company.com",
    createdAt: "2024-01-21",
    status: "active",
  },
]);

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

const getStaffCountByAdmin = (adminId) => {
  return staffAccounts.value.filter((staff) => staff.managerId === adminId).length;
};

const canAddStaff = (adminId) => {
  const admin = adminAccounts.value.find((a) => a.id === adminId);
  if (!admin) return false;
  const currentStaffCount = getStaffCountByAdmin(adminId);
  return currentStaffCount < admin.staffQuota;
};

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

const generateAccountId = () => {
  const prefix = "ST";
  const number = Math.floor(10000 + Math.random() * 90000);
  return prefix + number;
};

const addAdmin = () => {
  if (!newAdmin.value.email || !newAdmin.value.password || !newAdmin.value.confirmPassword) {
    alert("請填寫所有必填欄位");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newAdmin.value.email)) {
    alert("請輸入有效的 Email 格式");
    return;
  }

  if (adminAccounts.value.some((admin) => admin.email === newAdmin.value.email)) {
    alert("此 Email 已被使用");
    return;
  }

  if (newAdmin.value.password !== newAdmin.value.confirmPassword) {
    alert("密碼與確認密碼不一致");
    return;
  }

  if (!newAdmin.value.staffQuota || newAdmin.value.staffQuota < 1) {
    alert("請設定員工配額（至少 1 位）");
    return;
  }

  adminAccounts.value.push({
    id: adminAccounts.value.length + 1,
    email: newAdmin.value.email,
    staffQuota: newAdmin.value.staffQuota,
    createdAt: new Date().toISOString().split("T")[0],
  });

  showAddAdminModal.value = false;
  newAdmin.value = { email: "", password: "", confirmPassword: "", staffQuota: 5 };
  alert("管理者帳戶已建立");
};

const addStaff = () => {
  if (!selectedAdminId.value || !newStaff.value.password || !newStaff.value.confirmPassword) {
    alert("請填寫所有必填欄位");
    return;
  }

  if (newStaff.value.password !== newStaff.value.confirmPassword) {
    alert("密碼與確認密碼不一致");
    return;
  }

  const admin = adminAccounts.value.find((a) => a.id === selectedAdminId.value);
  if (!admin) {
    alert("找不到指定的管理者");
    return;
  }

  if (!canAddStaff(selectedAdminId.value)) {
    alert("該管理者的員工額度已滿");
    return;
  }

  const accountId = generateAccountId();

  staffAccounts.value.push({
    id: staffAccounts.value.length + 1,
    accountId: accountId,
    managerId: selectedAdminId.value,
    managerEmail: admin.email,
    createdAt: new Date().toISOString().split("T")[0],
    status: "active",
  });

  alert(`員工帳號已建立！\n帳號：${accountId}\n請妥善保管此帳號資訊`);

  showAddStaffModal.value = false;
  newStaff.value = { password: "", confirmPassword: "" };
};

const deleteAdmin = (adminId) => {
  const staffCount = getStaffCountByAdmin(adminId);
  const admin = adminAccounts.value.find((a) => a.id === adminId);

  if (staffCount > 0) {
    if (!confirm(`刪除管理者 ${admin.email} 將同時刪除 ${staffCount} 位員工帳戶，確定要繼續嗎？`)) {
      return;
    }
    staffAccounts.value = staffAccounts.value.filter((staff) => staff.managerId !== adminId);
  } else {
    if (!confirm(`確定要刪除管理者 ${admin.email} 嗎？`)) {
      return;
    }
  }

  adminAccounts.value = adminAccounts.value.filter((a) => a.id !== adminId);

  if (selectedAdminId.value === adminId) {
    selectedAdminId.value = null;
  }
};

const deleteStaff = (staffId) => {
  const staff = staffAccounts.value.find((s) => s.id === staffId);
  if (!confirm(`確定要刪除員工帳號 ${staff.accountId} 嗎？`)) {
    return;
  }
  staffAccounts.value = staffAccounts.value.filter((s) => s.id !== staffId);
};

const openEditQuotaModal = (admin) => {
  editingAdmin.value = admin;
  editQuotaValue.value = admin.staffQuota;
  showEditQuotaModal.value = true;
};

const saveQuota = () => {
  if (!editingAdmin.value) return;

  const currentUsage = getStaffCountByAdmin(editingAdmin.value.id);

  if (editQuotaValue.value < currentUsage) {
    alert(`新配額不可低於目前使用數 (${currentUsage})`);
    return;
  }

  const admin = adminAccounts.value.find((a) => a.id === editingAdmin.value.id);
  if (admin) {
    admin.staffQuota = editQuotaValue.value;
  }

  showEditQuotaModal.value = false;
  editingAdmin.value = null;
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    alert("帳號已複製到剪貼簿");
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

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 20px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header {
  padding: 28px 28px 20px 28px;
  border-bottom: 2px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.btn-close {
  width: 36px;
  height: 36px;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 24px;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;

  &:hover {
    background: #e2e8f0;
    color: #334155;
    transform: rotate(90deg);
  }
}

.modal-body {
  padding: 28px;
}

.modal-footer {
  padding: 20px 28px 28px 28px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  border-top: 2px solid #f1f5f9;
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

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
