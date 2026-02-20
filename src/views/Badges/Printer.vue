<script setup>
import { ref, computed } from "vue";
import vPrint from "vue3-print-nb";
import { useParticipantsStore } from "@/stores/participants";

const participantsStore = useParticipantsStore();

// 使用 store 的參與者數據
const allParticipants = computed(() => participantsStore.participants);

const searchQuery = ref("");
const selectedIds = ref([]);
const filteredParticipants = computed(() =>
  allParticipants.value.filter(
    (p) => p.name.includes(searchQuery.value) || p.company.includes(searchQuery.value),
  ),
);
const selectedParticipants = computed(() =>
  allParticipants.value.filter((p) => selectedIds.value.includes(p.id)),
);

// 2. 隨意拖曳範本設定 (核心升級)
const activeElement = ref(null); // 當前正在編輯的元件
const templateElements = ref([
  {
    id: "t1",
    key: "name",
    label: "姓名",
    x: 20,
    y: 180,
    style: { fontSize: 32, fontWeight: "900", color: "#1e293b" },
  },
  {
    id: "t2",
    key: "company",
    label: "單位",
    x: 20,
    y: 240,
    style: { fontSize: 16, fontWeight: "400", color: "#64748b" },
  },
  {
    id: "t3",
    key: "code",
    label: "QR編碼",
    x: 110,
    y: 60,
    style: { fontSize: 12, fontWeight: "400", color: "#cbd5e1" },
  },
]);

// 3. 處理拖曳位置 (簡單實現：透過點擊選中並編輯)
const selectElement = (el) => {
  activeElement.value = el;
};

// 4. 切換選取邏輯
const toggleSelection = (id) => {
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const toggleAll = () => {
  if (selectedIds.value.length === filteredParticipants.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredParticipants.value.map((p) => p.id);
  }
};

const isAllSelected = computed(
  () =>
    filteredParticipants.value.length > 0 &&
    selectedIds.value.length === filteredParticipants.value.length,
);
</script>

<template>
  <div class="badge-printer-view">
    <div class="page-header no-print">
      <div class="header-actions">
        <button
          class="btn-primary"
          :disabled="selectedIds.length === 0"
          v-print="{ id: 'printBadges', preview: false, popTitle: '識別證列印' }"
        >
          確認列印 ({{ selectedIds.length }})
        </button>
      </div>
    </div>

    <div class="main-layout">
      <div class="tech-card selection-panel no-print">
        <h3 class="card-subtitle">人員選擇</h3>
        <input
          v-model="searchQuery"
          class="input-styled search-input"
          placeholder="搜尋姓名或單位..."
        />
        <div class="list-header">
          <button class="btn-toggle-all" :class="{ active: isAllSelected }" @click="toggleAll">
            <span class="toggle-icon">{{ isAllSelected ? "✓" : "○" }}</span>
            全選
          </button>
          <span class="badge-count">已選 {{ selectedIds.length }} 位</span>
        </div>
        <div class="participant-selector">
          <div
            v-for="p in filteredParticipants"
            :key="p.id"
            class="p-item"
            :class="{ selected: selectedIds.includes(p.id) }"
            @click="toggleSelection(p.id)"
          >
            <div class="p-info">
              <span class="name">{{ p.name }}</span>
              <span class="comp">{{ p.company }}</span>
            </div>
            <div class="check-indicator">
              <span v-if="selectedIds.includes(p.id)" class="check-mark">✓</span>
            </div>
          </div>
        </div>
      </div>

      <div class="design-canvas-area no-print">
        <div class="tech-card badge-canvas">
          <div class="card-header-flex">
            <h3 class="card-subtitle">範本設計預覽</h3>
            <span class="size-label">實際尺寸 1:1</span>
          </div>
          <div class="canvas-box">
            <div
              v-for="el in templateElements"
              :key="el.id"
              class="draggable-element"
              :class="{ active: activeElement?.id === el.id }"
              :style="{
                left: el.x + 'px',
                top: el.y + 'px',
                fontSize: el.style.fontSize + 'px',
                fontWeight: el.style.fontWeight,
                color: el.style.color,
              }"
              @mousedown="selectElement(el)"
            >
              {{ el.label === "QR編碼" ? "QR CODE" : `[${el.label}]` }}
              <div class="drag-handle" v-if="activeElement?.id === el.id"></div>
            </div>
          </div>
        </div>

        <div class="tech-card style-editor" v-if="activeElement">
          <h3 class="card-subtitle">編輯：{{ activeElement.label }}</h3>
          <div class="controls">
            <div class="control-item">
              <label class="control-label">大小</label>
              <input
                type="range"
                v-model="activeElement.style.fontSize"
                min="12"
                max="60"
                class="range-input"
              />
              <span class="value-display">{{ activeElement.style.fontSize }}px</span>
            </div>
            <div class="control-item">
              <label class="control-label">顏色</label>
              <input type="color" v-model="activeElement.style.color" class="color-input-styled" />
              <span class="value-display">{{ activeElement.style.color }}</span>
            </div>
            <div class="control-item">
              <label class="control-label">X 位置</label>
              <input type="number" v-model="activeElement.x" class="input-styled number-input" />
            </div>
            <div class="control-item">
              <label class="control-label">Y 位置</label>
              <input type="number" v-model="activeElement.y" class="input-styled number-input" />
            </div>
          </div>
        </div>
      </div>

      <!-- 列印專用區域 -->
      <div id="printBadges" class="print-only-area">
        <div v-for="p in selectedParticipants" :key="p.id" class="print-badge">
          <div
            v-for="el in templateElements"
            :key="el.id"
            class="print-element"
            :style="{
              left: el.x + 'px',
              top: el.y + 'px',
              fontSize: el.style.fontSize + 'px',
              fontWeight: el.style.fontWeight,
              color: el.style.color,
            }"
          >
            {{ el.key === "name" ? p.name : el.key === "company" ? p.company : p.code }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.badge-printer-view {
  padding: 30px;
  background: #f8fafc;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 28px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
}

.main-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .card-subtitle {
    font-size: 1.1rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 20px 0;
    padding-bottom: 12px;
    border-bottom: 2px solid #f3f4f6;
  }
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0 !important;
    padding-bottom: 0 !important;
    border-bottom: none !important;
  }

  .size-label {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 700;
    background: #f8fafc;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  }
}

/* 左側人員選擇面板 */
.selection-panel {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;

  .search-input {
    margin-bottom: 12px;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 8px;
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;

    .btn-toggle-all {
      font-size: 0.9rem;
      font-weight: 700;
      color: #0f172a;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      padding: 0;
      transition: all 0.2s;

      .toggle-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 2px solid #cbd5e1;
        font-size: 12px;
        transition: all 0.2s;
      }

      &.active .toggle-icon {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-color: #667eea;
        color: white;
      }

      &:hover {
        color: #667eea;
      }

      &:hover .toggle-icon {
        border-color: #667eea;
      }
    }

    .badge-count {
      font-size: 0.8rem;
      font-weight: 700;
      color: #3b82f6;
      background: white;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #dbeafe;
    }
  }

  .participant-selector {
    flex: 1;
    overflow-y: auto;
    padding-right: 4px;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: #f8fafc;
      border-radius: 10px;
    }

    &::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 10px;

      &:hover {
        background: #94a3b8;
      }
    }
  }

  .p-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    margin-bottom: 8px;
    border: 2px solid transparent;
    background: #f8fafc;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;

    &:hover {
      border-color: #a5b4fc;
      background: #f5f3ff;
      transform: translateX(4px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.12);
    }

    &.selected {
      background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
      border-color: #667eea;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.25);

      &:hover {
        border-color: #667eea;
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
      }

      .p-info .name {
        color: #667eea;
      }
    }

    .p-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .name {
        font-weight: 700;
        color: #0f172a;
        font-size: 0.95rem;
        transition: color 0.2s;
      }

      .comp {
        font-size: 0.75rem;
        color: #64748b;
        font-weight: 500;
      }
    }

    .check-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;

      .check-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 14px;
        font-weight: bold;
        animation: checkPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      }
    }
  }

  @keyframes checkPop {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
}

.input-styled {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  font-weight: 600;
  transition: 0.3s;

  &:hover {
    border-color: #cbd5e1;
  }

  &:focus {
    border-color: #3b82f6;
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  &.number-input {
    text-align: center;
  }
}

/* 設計畫布區域 */
.design-canvas-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.badge-canvas {
  display: flex;
  flex-direction: column;
  align-items: center;

  .canvas-box {
    width: 320px;
    height: 450px;
    background: white;
    position: relative;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    border: 2px solid #e2e8f0;

    .draggable-element {
      position: absolute;
      cursor: move;
      padding: 6px 10px;
      border: 2px dashed transparent;
      white-space: nowrap;
      border-radius: 6px;
      transition: all 0.2s;

      &:hover {
        background: rgba(59, 130, 246, 0.05);
        border-color: #cbd5e1;
      }

      &.active {
        border: 2px dashed #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);

        .drag-handle {
          position: absolute;
          bottom: -8px;
          right: -8px;
          width: 16px;
          height: 16px;
          background: #3b82f6;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }
      }
    }
  }
}

.style-editor {
  .controls {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;

    .control-item {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .control-label {
        font-size: 0.85rem;
        font-weight: 700;
        color: #0f172a;
      }

      .range-input {
        width: 100%;
        height: 6px;
        border-radius: 10px;
        background: #f8fafc;
        outline: none;
        cursor: pointer;

        &::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);

          &:hover {
            transform: scale(1.2);
          }
        }
      }

      .color-input-styled {
        border: none;
        width: 50px;
        height: 40px;
        cursor: pointer;
        background: none;
        border-radius: 8px;
        overflow: hidden;

        &::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        &::-webkit-color-swatch {
          border: 2px solid var(--border-light);
          border-radius: 8px;
        }
      }

      .value-display {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-gray);
        font-family: monospace;
      }
    }
  }
}

/* 列印專用區域 - 平時隱藏 */
.print-only-area {
  display: none;
}

@media print {
  .badge-printer-view {
    padding: 0;
    background: white;
  }

  .page-header,
  .selection-panel,
  .design-canvas-area,
  .main-layout {
    display: none !important;
  }

  .print-only-area {
    display: block !important;
    position: relative;
    left: auto;
    top: auto;
  }

  .print-badge {
    width: 90mm;
    height: 125mm;
    position: relative;
    page-break-after: always;
    background: white;
    border: 1px solid #e2e8f0;
    margin: 0 auto 10mm;

    .print-element {
      position: absolute;
    }

    &:last-child {
      page-break-after: auto;
      margin-bottom: 0;
    }
  }

  @page {
    margin: 10mm;
    size: A4;
  }
}
</style>
