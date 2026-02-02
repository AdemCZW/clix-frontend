<script setup>
import { reactive, ref, computed, watch } from "vue";
import draggable from "vuedraggable";

// 1. 賓客名單 (保留原邏輯)
const allParticipants = reactive([
  {
    id: "P01",
    name: "王小明",
    company: "文靜科技股份有限公司",
    title: "技術總監",
    type: "VIP",
    code: "EV-001",
  },
  {
    id: "P02",
    name: "李大華",
    company: "創新數位設計",
    title: "資深設計師",
    type: "Attendee",
    code: "EV-002",
  },
  {
    id: "P03",
    name: "張美麗",
    company: "全球物流系統",
    title: "行銷經理",
    type: "Staff",
    code: "EV-003",
  },
  {
    id: "P04",
    name: "林志玲",
    company: "時尚媒體公司",
    title: "創意總監",
    type: "VIP",
    code: "EV-004",
  },
]);

const searchQuery = ref("");
const selectedIds = ref([]);
const filteredParticipants = computed(() =>
  allParticipants.filter(
    (p) => p.name.includes(searchQuery.value) || p.company.includes(searchQuery.value),
  ),
);
const selectedParticipants = computed(() =>
  allParticipants.filter((p) => selectedIds.value.includes(p.id)),
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

// 4. 列印與全選邏輯
const toggleAll = (e) =>
  (selectedIds.value = e.target.checked ? filteredParticipants.value.map((p) => p.id) : []);
const handlePrint = () => {
  if (selectedIds.value.length === 0) return alert("請先勾選人員！");
  window.print();
};
</script>

<template>
  <div class="registration-view">
    <div class="page-header no-print">
      <div class="title-group">
        <h2 class="title">識別證列印設計</h2>
        <p class="subtitle">拖動預覽區的元件調整位置，點擊元件修改樣式</p>
      </div>
      <button class="btn-preview-action" :disabled="selectedIds.length === 0" @click="handlePrint">
        <span class="btn-inner"> 🖨️ 確認列印 ({{ selectedIds.length }}) </span>
        <span class="pulse-ring"></span>
      </button>
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
          <label class="checkbox-label"> <input type="checkbox" @change="toggleAll" /> 全選 </label>
          <span class="badge-count">已選 {{ selectedIds.length }} 位</span>
        </div>
        <div class="participant-selector">
          <div
            v-for="p in filteredParticipants"
            :key="p.id"
            class="p-item"
            :class="{ active: selectedIds.includes(p.id) }"
          >
            <input type="checkbox" v-model="selectedIds" :value="p.id" />
            <div class="p-info">
              <span class="name">{{ p.name }}</span>
              <span class="comp">{{ p.company }}</span>
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

      <div class="print-only-area">
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
/* CSS Variables - 統一設計系統 */
.registration-view {
  padding: 12px;
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  min-height: 100vh;
  --primary-blue: #3b82f6;
  --deep-dark: #0f172a;
  --text-gray: #64748b;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;

  .title-group {
    .title {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--deep-dark);
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }

    .subtitle {
      font-size: 0.85rem;
      color: var(--text-gray);
      margin: 0;
      font-weight: 600;
    }
  }
}

.btn-preview-action {
  position: relative;
  background: var(--deep-dark);
  color: white;
  border: none;
  padding: 12px 26px;
  border-radius: 50px;
  cursor: pointer;
  transition: 0.4s;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.2);

  .btn-inner {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
  }

  .pulse-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    background: var(--primary-blue);
    opacity: 0;
    border-radius: 50px;
    z-index: 1;
  }

  &:hover {
    transform: translateY(-4px);
    background: #000;

    .pulse-ring {
      animation: pulse 1.5s infinite;
      opacity: 0.3;
    }
  }

  &:disabled {
    background: #cbd5e1;
    cursor: not-allowed;
    transform: none;

    &:hover {
      transform: none;

      .pulse-ring {
        animation: none;
      }
    }
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.3;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.15;
  }
  100% {
    transform: scale(1.2);
    opacity: 0;
  }
}

.main-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}

.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .card-subtitle {
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid #f1f5f9;
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
    color: var(--text-gray);
    font-weight: 700;
    background: var(--bg-soft);
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-light);
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
    background: var(--bg-soft);
    border-radius: 8px;
    margin-bottom: 12px;
    border: 1px solid var(--border-light);

    .checkbox-label {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--deep-dark);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge-count {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--primary-blue);
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
      background: var(--bg-soft);
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
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    margin-bottom: 8px;
    border: 1px solid transparent;
    background: var(--bg-soft);
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
      border-color: var(--primary-blue);
      background: white;
      transform: translateX(4px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
    }

    &.active {
      background: #eff6ff;
      border-color: var(--primary-blue);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
    }

    .p-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .name {
        font-weight: 800;
        color: var(--deep-dark);
        font-size: 0.95rem;
      }

      .comp {
        font-size: 0.75rem;
        color: var(--text-gray);
        font-weight: 600;
      }
    }
  }
}

.input-styled {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  transition: 0.3s;

  &:hover {
    border-color: #cbd5e1;
  }

  &:focus {
    border-color: var(--primary-blue);
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
    border: 2px solid var(--border-light);

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
        border: 2px dashed var(--primary-blue);
        background: rgba(59, 130, 246, 0.1);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);

        .drag-handle {
          position: absolute;
          bottom: -8px;
          right: -8px;
          width: 16px;
          height: 16px;
          background: var(--primary-blue);
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
        color: var(--deep-dark);
      }

      .range-input {
        width: 100%;
        height: 6px;
        border-radius: 10px;
        background: var(--bg-soft);
        outline: none;
        cursor: pointer;

        &::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--primary-blue);
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

/* 列印樣式 */
.print-only-area {
  display: none;
}

@media print {
  .no-print {
    display: none !important;
  }

  .print-only-area {
    display: block;

    .print-badge {
      width: 90mm;
      height: 125mm;
      position: relative;
      page-break-after: always;
      background: white;
      border: 0.1mm solid #eee;

      .print-element {
        position: absolute;
      }
    }
  }
}
</style>
