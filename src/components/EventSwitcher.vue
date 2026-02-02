<template>
  <div class="event-switcher">
    <div class="switcher-button" @click.stop="toggleDropdown" :class="{ active: showDropdown }">
      <span class="current-event">
        {{ userStore.currentSeries?.name || "未選擇系列" }} -
        {{ userStore.currentEvent?.name || "未選擇活動" }}
      </span>
      <svg
        class="dropdown-icon"
        :class="{ rotated: showDropdown }"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>

    <!-- 下拉選單 -->
    <div v-if="showDropdown" ref="dropdownRef" class="dropdown-menu">
      <div class="dropdown-header">
        <h4>切換專案</h4>
        <button class="close-btn" @click="closeDropdown">×</button>
      </div>

      <div class="series-list">
        <div
          v-for="series in userStore.series"
          :key="series.id"
          class="series-item"
          :class="{ active: series.id === userStore.currentSeries?.id }"
        >
          <div class="series-header" @click="toggleSeries(series)">
            <span class="series-name">{{ series.name }}</span>
            <svg
              class="expand-icon"
              :class="{ expanded: expandedSeries === series.id }"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>

          <!-- 展開的活動列表 -->
          <div v-if="expandedSeries === series.id" class="events-sublist">
            <div
              v-for="event in userStore.events.filter((e) => e.seriesId === series.id)"
              :key="event.id"
              class="event-subitem"
              :class="{ active: event.id === userStore.currentEvent?.id }"
              @click="selectEvent(event)"
            >
              <span class="event-name">{{ event.name }}</span>
              <span class="event-meta">{{ event.date }}</span>
              <div v-if="event.id === userStore.currentEvent?.id" class="current-indicator">✓</div>
            </div>

            <!-- 新增活動按鈕 -->
            <div class="add-event-in-series" @click="showAddEventForSeries(series)">
              <span class="add-event-text">➕ 新增活動</span>
            </div>
          </div>
        </div>
      </div>

      <div class="dropdown-footer">
        <button class="add-btn" @click="showAddSeries = true">➕ 新增系列</button>
      </div>
    </div>

    <!-- 新增活動模態框 -->
    <Transition name="modal">
      <div v-if="showAddEvent" class="add-event-modal" @click.self="showAddEvent = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>新增活動</h3>
            <button class="close-btn" @click="showAddEvent = false">×</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label>活動名稱 *</label>
              <input
                v-model="newEvent.name"
                type="text"
                placeholder="輸入活動名稱"
                class="input-field"
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>日期 *</label>
                <input v-model="newEvent.date" type="date" class="input-field" />
              </div>
              <div class="form-group">
                <label>時間 *</label>
                <input v-model="newEvent.time" type="time" class="input-field" />
              </div>
            </div>

            <div class="form-group">
              <label>地點 *</label>
              <input
                v-model="newEvent.location"
                type="text"
                placeholder="活動舉辦地點"
                class="input-field"
              />
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" @click="showAddEvent = false">取消</button>
            <button class="btn-primary" :disabled="!canAddEvent" @click="addEvent">新增活動</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 新增系列模態框 -->
    <Transition name="modal">
      <div v-if="showAddSeries" class="add-series-modal" @click.self="showAddSeries = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>新增系列</h3>
            <button class="close-btn" @click="showAddSeries = false">×</button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label>系列名稱 *</label>
              <input
                v-model="newSeries.name"
                type="text"
                placeholder="輸入系列名稱"
                class="input-field"
              />
            </div>

            <div class="form-group">
              <label>系列描述</label>
              <textarea
                v-model="newSeries.description"
                placeholder="簡要描述這個系列的活動"
                class="input-field textarea-field"
                rows="3"
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" @click="showAddSeries = false">取消</button>
            <button class="btn-primary" :disabled="!canAddSeries" @click="addSeries">
              新增系列
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();
const showDropdown = ref(false);
const showAddEvent = ref(false);
const showAddSeries = ref(false);
const dropdownRef = ref(null);
const expandedSeries = ref(null);
const selectedSeriesForEvent = ref(null);

const newEvent = ref({
  name: "",
  date: "",
  time: "",
  location: "",
});

const newSeries = ref({
  name: "",
  description: "",
});

const canAddEvent = computed(() => {
  return (
    newEvent.value.name.trim() &&
    newEvent.value.date &&
    newEvent.value.time &&
    newEvent.value.location.trim()
  );
});

const canAddSeries = computed(() => {
  return newSeries.value.name.trim();
});

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value;
};

const closeDropdown = () => {
  showDropdown.value = false;
};

const selectEvent = (event) => {
  userStore.switchEvent(event);
  closeDropdown();
};

const toggleSeries = (series) => {
  if (expandedSeries.value === series.id) {
    expandedSeries.value = null;
  } else {
    expandedSeries.value = series.id;
  }
};

const selectSeries = (series) => {
  userStore.switchSeries(series);
  // 自動展開選擇的系列
  expandedSeries.value = series.id;
};

const showAddEventForSeries = (series) => {
  selectedSeriesForEvent.value = series;
  showAddEvent.value = true;
};

const addEvent = () => {
  if (canAddEvent.value) {
    const eventData = {
      id: `event_${Date.now()}`,
      seriesId: selectedSeriesForEvent.value?.id || userStore.currentSeries?.id || "default",
      name: newEvent.value.name,
      date: newEvent.value.date,
      time: newEvent.value.time,
      location: newEvent.value.location,
      status: "draft",
      createdAt: new Date().toISOString(),
    };

    userStore.addEvent(eventData);
    userStore.switchEvent(eventData);

    // 重置表單
    newEvent.value = { name: "", date: "", time: "", location: "" };
    selectedSeriesForEvent.value = null;
    showAddEvent.value = false;
    closeDropdown();
  }
};

const addSeries = () => {
  if (canAddSeries.value) {
    const seriesData = {
      id: `series_${Date.now()}`,
      name: newSeries.value.name,
      description: newSeries.value.description,
      createdAt: new Date().toISOString(),
    };

    userStore.addSeries(seriesData);
    userStore.switchSeries(seriesData);

    // 重置表單
    newSeries.value = { name: "", description: "" };
    showAddSeries.value = false;
    closeDropdown();
  }
};

// 點擊外部關閉下拉選單
const handleClickOutside = (event) => {
  const switcher = event.target.closest(".event-switcher");
  if (!switcher && showDropdown.value) {
    closeDropdown();
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style lang="scss" scoped>
.event-switcher {
  position: relative;
  display: inline-block;
}

.switcher-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  max-width: 350px;
  user-select: none;
  position: relative;
  z-index: 1;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(56, 189, 248, 0.4);
  }

  &.active {
    background: rgba(56, 189, 248, 0.15);
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }

  .current-event {
    font-size: 0.95rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .dropdown-icon {
    transition: transform 0.2s ease;
    flex-shrink: 0;

    &.rotated {
      transform: rotate(180deg);
    }
  }
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  width: 400px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  z-index: 9999;
  overflow: hidden;
}

.dropdown-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;

  h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: var(--text-main);
    }
  }
}

.series-list {
  max-height: 400px;
  overflow-y: auto;
}

.series-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;

  &.active .series-header {
    background: transparent;
    border-left: 5px solid var(--accent-blue);
    padding-left: 15px;

    .series-name {
      color: var(--accent-blue);
    }
  }

  .series-header {
    padding: 14px 20px;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-left 0.2s ease,
      padding-left 0.2s ease,
      color 0.2s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 6px;
    margin: 4px 8px;
    border-left: 5px solid transparent;

    &:hover {
      background: transparent;
    }

    .series-name {
      font-weight: 700;
      font-size: 1rem;
      color: var(--text-main);
      flex: 1;
      letter-spacing: 0.3px;
    }

    .expand-icon {
      transition: transform 0.2s ease;
      color: var(--text-muted);

      &.expanded {
        transform: rotate(90deg);
      }
    }
  }

  .events-sublist {
    background: transparent;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: 6px 0;
    margin: 0 8px;
    border-radius: 0 0 6px 6px;
  }

  .event-subitem {
    padding: 12px 20px 12px 36px;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-left 0.2s ease,
      padding-left 0.2s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    position: relative;
    margin: 0 4px;
    border-radius: 4px;
    border-left: 5px solid transparent;

    &::before {
      content: "•";
      position: absolute;
      left: 20px;
      color: var(--text-muted);
      font-size: 1.2rem;
    }

    &:hover {
      background: transparent;
    }

    &.active {
      background: transparent;
      border-left: 5px solid var(--accent-blue);
      padding-left: 31px;

      .event-name {
        color: var(--accent-blue);
        font-weight: 700;
      }

      &::before {
        content: "▶";
        color: var(--accent-blue);
        font-size: 0.8rem;
        left: 15px;
      }
    }

    .event-name {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-main);
      flex: 1;
    }

    .event-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.06);
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 500;
    }

    .current-indicator {
      color: var(--accent-blue);
      font-weight: 700;
      font-size: 1.2rem;
    }
  }

  .add-event-in-series {
    padding: 12px 20px 12px 36px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin: 4px 4px 0;
    border-radius: 0 0 4px 4px;

    &:hover {
      background: rgba(56, 189, 248, 0.1);
    }

    .add-event-text {
      color: var(--accent-blue);
      font-weight: 600;
      font-size: 0.88rem;
      letter-spacing: 0.3px;
    }
  }
}

.dropdown-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);

  .add-btn {
    width: 100%;
    padding: 10px;
    background: var(--accent-blue);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background: #2563eb;
    }
  }
}

/* 新增活動模態框 */
.add-event-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

/* 新增系列模態框 */
.add-series-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;

    &:hover {
      color: var(--text-main);
    }
  }
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 16px;

  label {
    display: block;
    font-weight: 600;
    color: var(--text-main);
    margin-bottom: 8px;
    font-size: 0.9rem;
  }

  .input-field {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-main);
    font-size: 1rem;

    &:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
  }

  .textarea-field {
    resize: vertical;
    min-height: 80px;
  }
}

.form-row {
  display: flex;
  gap: 12px;

  .form-group {
    flex: 1;
  }
}

.modal-footer {
  padding: 20px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;

  &:hover {
    border-color: var(--text-main);
    color: var(--text-main);
  }
}

.btn-primary {
  padding: 10px 20px;
  background: var(--accent-blue);
  border: none;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;

  &:hover:not(:disabled) {
    background: #2563eb;
  }

  &:disabled {
    background: #6b7280;
    cursor: not-allowed;
  }
}

/* 動畫 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

.modal-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
