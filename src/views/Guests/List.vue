<script setup>
import { reactive, ref, computed, onMounted } from "vue";
import { useGuestsStore } from "@/stores/guests";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";

const guestsStore = useGuestsStore();
const eventsStore = useEventsStore();
const { success, error } = useToast();

const activityOptions = ref(["所有活動"]);
const selectedActivity = ref("所有活動");
const sortBy = ref("newest");
const editingGuest = ref(null);

// 直接使用 store 的 reactive guests 陣列
const guests = guestsStore.guests;

// 進入頁面時載入當前活動的貴賓
onMounted(async () => {
  const event = eventsStore.currentEvent;
  if (event && event.id) {
    try {
      await guestsStore.fetchGuests(event.id);
    } catch (err) {
      error(err.message || "載入貴賓列表失敗");
    }
  }
});

const formatDate = (dateStr) => dateStr || "--";

const filteredGuests = computed(() => {
  let result = [...guests];
  if (selectedActivity.value !== "所有活動")
    result = result.filter((g) => g.activity === selectedActivity.value);
  if (sortBy.value === "name") result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  else result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return result;
});

const addGuest = async () => {
  const event = eventsStore.currentEvent;
  if (!event || !event.id) {
    error("請先選擇一個活動");
    return;
  }
  try {
    const newGuest = await guestsStore.createGuest({
      name: "新增貴賓",
      title: "",
      company: "",
      email: "",
      phone: "",
      bio: "",
      event: event.id,
    });
    editingGuest.value = newGuest;
    success("貴賓已建立，請填寫詳細資料");
  } catch (err) {
    error(err.message || "新增貴賓失敗");
  }
};

const deleteGuest = async (guest) => {
  if (!window.confirm(`確定要刪除貴賓 ${guest.name} 嗎？`)) return;
  try {
    await guestsStore.deleteGuest(guest.id);
    if (editingGuest.value && editingGuest.value.id === guest.id) {
      editingGuest.value = null;
    }
    success("貴賓已刪除");
  } catch (err) {
    error(err.message || "刪除貴賓失敗");
  }
};

const openEditPanel = (guest) => {
  editingGuest.value = guest;
};

const closeEditPanel = () => {
  editingGuest.value = null;
};

// 儲存貴賓編輯（自動觸發）
const saveGuest = async (guest) => {
  if (!guest || !guest.id) return;
  try {
    await guestsStore.updateGuest(guest.id, {
      name: guest.name,
      title: guest.title,
      company: guest.company,
      email: guest.email,
      phone: guest.phone,
      bio: guest.bio,
    });
    success("貴賓資料已儲存");
  } catch (err) {
    error(err.message || "儲存失敗");
  }
};

const onAvatarChange = (e, guest) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      guest.avatar = event.target.result;
    };
    reader.readAsDataURL(file);
  }
};

const getInitials = (name) => {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
};
</script>

<template>
  <div class="guests-view">
    <div class="page-header">
      <div class="control-bar">
        <div class="filter-group">
          <select v-model="selectedActivity" class="select-styled">
            <option v-for="opt in activityOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-model="sortBy" class="select-styled">
            <option value="newest">最新加入</option>
            <option value="name">姓名排序</option>
          </select>
        </div>
        <button class="btn-add-guest" @click="addGuest">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          新增貴賓
        </button>
      </div>
    </div>

    <div class="guests-list">
      <div
        v-for="guest in filteredGuests"
        :key="guest.id"
        class="guest-item"
        :class="{ active: editingGuest === guest, selected: guestsStore.isGuestSelected(guest.id) }"
      >
        <label class="checkbox-wrapper" @click.stop>
          <input
            type="checkbox"
            :checked="guestsStore.isGuestSelected(guest.id)"
            @change="guestsStore.toggleGuest(guest)"
          />
          <span class="checkmark"></span>
        </label>
        <div class="guest-info" @click="openEditPanel(guest)">
          <div class="avatar-wrapper">
            <div
              class="avatar"
              :style="guest.avatar ? { backgroundImage: `url(${guest.avatar})` } : {}"
            >
              <span v-if="!guest.avatar" class="avatar-initial">{{ getInitials(guest.name) }}</span>
            </div>
          </div>

          <div class="guest-details">
            <div class="guest-name">{{ guest.name || "未命名" }}</div>
            <div class="guest-company">{{ guest.company || "未填寫公司" }}</div>
          </div>

          <button class="btn-expand" @click.stop="openEditPanel(guest)">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 右側滑出編輯面板 -->
    <Teleport to="body">
      <Transition name="panel-slide">
        <div v-if="editingGuest" class="edit-panel-overlay" @click.self="closeEditPanel">
          <div class="edit-panel">
            <div class="panel-header">
              <h3>編輯貴賓資訊</h3>
              <button class="btn-close" @click="closeEditPanel">✕</button>
            </div>

            <div class="panel-body">
              <div class="avatar-upload-section">
                <label
                  class="avatar-upload-large"
                  :style="
                    editingGuest.avatar ? { backgroundImage: `url(${editingGuest.avatar})` } : {}
                  "
                >
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    @change="onAvatarChange($event, editingGuest)"
                  />
                  <div v-if="!editingGuest.avatar" class="upload-placeholder">
                    <svg
                      viewBox="0 0 24 24"
                      width="32"
                      height="32"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                      ></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <span>上傳頭像</span>
                  </div>
                  <div v-else class="change-overlay">
                    <span>更換照片</span>
                  </div>
                </label>
              </div>

              <div class="form-section">
                <h4 class="section-title">基本資訊</h4>

                <div class="form-field">
                  <label>姓名 *</label>
                  <input
                    v-model="editingGuest.name"
                    placeholder="請輸入姓名"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>公司</label>
                  <input
                    v-model="editingGuest.company"
                    placeholder="請輸入公司名稱"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>職稱</label>
                  <input
                    v-model="editingGuest.title"
                    placeholder="請輸入職稱"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>簡介</label>
                  <textarea
                    v-model="editingGuest.bio"
                    placeholder="請輸入個人簡介"
                    class="textarea-styled"
                    rows="3"
                  ></textarea>
                </div>

                <div class="form-field">
                  <label>參加活動</label>
                  <select v-model="editingGuest.activity" class="select-styled full-width">
                    <option v-for="opt in activityOptions.slice(1)" :key="opt" :value="opt">
                      {{ opt }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-section">
                <h4 class="section-title">聯絡資訊</h4>

                <div class="form-field">
                  <label>電子信箱</label>
                  <input
                    v-model="editingGuest.email"
                    type="email"
                    placeholder="請輸入信箱"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>聯絡電話</label>
                  <input
                    v-model="editingGuest.phone"
                    type="tel"
                    placeholder="請輸入電話"
                    class="input-styled"
                  />
                </div>
              </div>

              <div class="form-section">
                <div class="meta-info">
                  <span class="meta-label">加入時間</span>
                  <span class="meta-value">{{ formatDate(editingGuest.createdAt) }}</span>
                </div>
              </div>
            </div>

            <div class="panel-footer">
              <button class="btn-delete-guest" @click="deleteGuest(editingGuest)">刪除貴賓</button>
              <button class="btn-save" @click="closeEditPanel">儲存</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.guests-view {
  min-height: 100%;
  background: var(--bg-primary, #f8f9fa);
}

.page-header {
  margin-bottom: 24px;
}

.control-bar {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light, #e5e7eb);
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: box-shadow 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.filter-group {
  display: flex;
  gap: 12px;
}

.select-styled {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  font-weight: 600;
  color: var(--deep-dark, #0f172a);
  background: var(--bg-soft, #f8fafc);
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;

  &.full-width {
    width: 100%;
  }

  &:hover {
    border-color: #cbd5e1;
  }

  &:focus {
    border-color: var(--primary-blue, #3b82f6);
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
}

.btn-add-guest {
  background: var(--primary-blue, #3b82f6);
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);

  &:hover {
    background: #2563eb;
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
}

/* 貴賓列表 */
.guests-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.guest-item {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light, #e5e7eb);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 16px;
  padding-left: 20px;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-4px);
  }

  &.active {
    border-color: var(--primary-blue, #3b82f6);
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.2);
  }

  &.selected {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    border-color: #10b981;
  }
}

/* 勾選框樣式 */
.checkbox-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;

  input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .checkmark {
    height: 24px;
    width: 24px;
    background-color: white;
    border: 2px solid #cbd5e1;
    border-radius: 8px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;

    &:after {
      content: "";
      display: none;
      width: 6px;
      height: 11px;
      border: solid white;
      border-width: 0 3px 3px 0;
      transform: rotate(45deg);
    }
  }

  input:checked ~ .checkmark {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: #10b981;

    &:after {
      display: block;
    }
  }

  &:hover .checkmark {
    border-color: #10b981;
    transform: scale(1.1);
  }
}

.guest-info {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 16px 20px 16px 0;
  cursor: pointer;
  gap: 16px;
  text-align: left;
  flex: 1;
  position: relative;
  z-index: 1;
}

.avatar-wrapper {
  flex-shrink: 0;
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: all 0.3s;

  .avatar-initial {
    font-size: 1.5rem;
    font-weight: 800;
    color: white;
  }

  .guest-item:hover & {
    transform: scale(1.1);
  }
}

.guest-details {
  flex: 1;
  min-width: 0;
}

.guest-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--deep-dark, #0f172a);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guest-company {
  font-size: 0.9rem;
  color: #374151;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-expand {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--border-light, #e5e7eb);
  background: white;
  color: var(--primary-blue, #3b82f6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;

  &:hover {
    background: var(--primary-blue, #3b82f6);
    color: white;
    border-color: var(--primary-blue, #3b82f6);
    transform: rotate(90deg);
  }
}

/* 右側編輯面板 */
.edit-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-end;
  z-index: 9999;
}

.edit-panel {
  width: 100%;
  max-width: 480px;
  height: 100%;
  background: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease-out;
}

.panel-header {
  padding: 24px;
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);

  h3 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--deep-dark, #0f172a);
  }

  .btn-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #f1f5f9;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: #64748b;
    transition: all 0.3s;

    &:hover {
      background: #fee2e2;
      color: #ef4444;
      transform: rotate(90deg);
    }
  }
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.avatar-upload-section {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.avatar-upload-large {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  background-size: cover;
  background-position: center;
  border: 3px dashed var(--border-light, #cbd5e1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: var(--primary-blue, #3b82f6);
    transform: scale(1.05);

    .change-overlay {
      opacity: 1;
    }
  }

  .upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: #64748b;

    span {
      font-size: 0.85rem;
      font-weight: 600;
    }
  }

  .change-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(59, 130, 246, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s;

    span {
      color: white;
      font-weight: 700;
      font-size: 0.9rem;
    }
  }
}

.form-section {
  margin-bottom: 32px;

  .section-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--deep-dark, #0f172a);
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--border-light, #f1f5f9);
  }
}

.form-field {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 700;
    color: #475569;
    margin-bottom: 8px;
  }
}

.input-styled {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--deep-dark, #0f172a);
  background: white;
  transition: all 0.3s;
  font-family: inherit;

  &::placeholder {
    color: #9ca3af;
    font-weight: 500;
  }

  &:hover {
    border-color: #cbd5e1;
  }

  &:focus {
    border-color: var(--primary-blue, #3b82f6);
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
}

.textarea-styled {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  font-weight: 500;
  font-size: 0.95rem;
  color: var(--deep-dark, #0f172a);
  background: white;
  transition: all 0.3s;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;

  &::placeholder {
    color: #9ca3af;
    font-weight: 500;
  }

  &:hover {
    border-color: #cbd5e1;
  }

  &:focus {
    border-color: var(--primary-blue, #3b82f6);
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
}

.meta-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-soft, #f8fafc);
  border-radius: 12px;
  border: 1px solid var(--border-light, #e5e7eb);

  .meta-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
  }

  .meta-value {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--deep-dark, #0f172a);
  }
}

.panel-footer {
  padding: 20px 24px;
  border-top: 1px solid var(--border-light, #e5e7eb);
  display: flex;
  gap: 12px;
  background: var(--bg-soft, #f8fafc);
}

.btn-delete-guest {
  flex: 1;
  padding: 12px 20px;
  border-radius: 12px;
  border: 2px solid #fee2e2;
  background: #fef2f2;
  color: #ef4444;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background: #fee2e2;
    border-color: #ef4444;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
  }
}

.btn-save {
  flex: 2;
  padding: 12px 20px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);

  &:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
}

/* 動畫 */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-from {
  opacity: 0;

  .edit-panel {
    transform: translateX(100%);
  }
}

.panel-slide-leave-to {
  opacity: 0;

  .edit-panel {
    transform: translateX(100%);
  }
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
</style>
