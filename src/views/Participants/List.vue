<script setup>
import { reactive, ref, computed } from "vue";
import * as XLSX from "xlsx";

// 1. 參與者數據
const participants = reactive([
  {
    id: "001",
    name: "王小明",
    company: "文靜科技",
    title: "技術總監",
    phone: "0912-345-678",
    email: "wang@test.com",
    type: "VIP",
    status: "已報到",
  },
  {
    id: "002",
    name: "李大華",
    company: "創新設計",
    title: "設計師",
    phone: "0922-111-222",
    email: "lee@test.com",
    type: "Attendee",
    status: "未報到",
  },
  {
    id: "003",
    name: "張美麗",
    company: "全球物流",
    title: "行銷經理",
    phone: "0933-444-555",
    email: "chang@test.com",
    type: "Staff",
    status: "已報到",
  },
]);

// 2. 搜尋與過濾狀態
const searchQuery = ref("");
const filterType = ref("All"); // 身分過濾
const filterStatus = ref("All"); // 狀態過濾

// 【動態產生選項】自動從資料中抓取不重複的值
const allTypes = computed(() => ["All", ...new Set(participants.map((p) => p.type))]);
const allStatuses = computed(() => ["All", ...new Set(participants.map((p) => p.status))]);

// 【核心過濾邏輯】三項條件連動
const filteredList = computed(() => {
  return participants.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchType = filterType.value === "All" || p.type === filterType.value;
    const matchStatus = filterStatus.value === "All" || p.status === filterStatus.value;
    return matchSearch && matchType && matchStatus;
  });
});

// 3. 匯出 Excel 邏輯
const isExporting = ref(false);
const handleExport = () => {
  if (filteredList.value.length === 0) return alert("目前沒有資料可匯出");
  isExporting.value = true;

  const exportData = filteredList.value.map((p) => ({
    編號: p.id,
    姓名: p.name,
    單位: p.company,
    職稱: p.title,
    電話: p.phone,
    Email: p.email,
    身分: p.type,
    報到狀態: p.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");
  XLSX.writeFile(workbook, `參與者名單_${new Date().getTime()}.xlsx`);
  isExporting.value = false;
};

// 4. 匯入 Excel 邏輯
const fileInput = ref(null);
const triggerImport = () => fileInput.value.click();
const handleImport = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const sanitizedData = rawData.map((item, index) => ({
      id: `IMP-${Date.now()}-${index}`,
      name: item["姓名"] || item["Name"] || "未知姓名",
      company: item["單位"] || item["公司"] || "-",
      title: item["職稱"] || "-",
      phone: item["電話"] || "-",
      email: item["Email"] || "-",
      type: item["身分"] || "Attendee",
      status: item["報到狀態"] || "未報到",
    }));

    participants.push(...sanitizedData);
    e.target.value = "";
  };
  reader.readAsArrayBuffer(file);
};
</script>

<template>
  <div class="participants-view">
    <div class="page-header">
      <div class="header-actions">
        <input
          type="file"
          ref="fileInput"
          style="display: none"
          accept=".xlsx, .xls"
          @change="handleImport"
        />
        <button class="btn-import" @click="triggerImport">📥 匯入名單</button>
        <button class="btn-export" :disabled="isExporting" @click="handleExport">
          📊 {{ isExporting ? "處理中..." : "匯出 Excel" }}
        </button>
        <button class="btn-primary">＋ 新增</button>
      </div>
    </div>

    <div class="tech-card filter-bar">
      <div class="search-wrapper">
        <span class="search-icon">🔍</span>
        <input v-model="searchQuery" placeholder="搜尋姓名、公司..." class="search-input" />
      </div>

      <div class="filter-options">
        <div class="filter-item">
          <label>身分篩選</label>
          <select v-model="filterType" class="select-rounded">
            <option v-for="t in allTypes" :key="t" :value="t">
              {{ t === "All" ? "所有身分" : t }}
            </option>
          </select>
        </div>

        <div class="filter-item">
          <label>報到狀態</label>
          <select v-model="filterStatus" class="select-rounded">
            <option v-for="s in allStatuses" :key="s" :value="s">
              {{ s === "All" ? "所有狀態" : s }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div class="tech-card table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>姓名 / Email</th>
            <th>公司單位 / 職稱</th>
            <th>聯絡電話</th>
            <th>身分</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filteredList" :key="p.id">
            <td>
              <div class="name-cell">
                <span class="avatar">{{ p.name.charAt(0) }}</span>
                <div>
                  <div class="name">{{ p.name }}</div>
                  <div class="email-sub">{{ p.email }}</div>
                </div>
              </div>
            </td>
            <td>
              <div class="comp">{{ p.company }}</div>
              <div class="title-sub">{{ p.title }}</div>
            </td>
            <td>{{ p.phone }}</td>
            <td>
              <span :class="['tag', p.type.toLowerCase()]">{{ p.type }}</span>
            </td>
            <td>
              <span :class="['status-dot', p.status === '已報到' ? 'check' : '']">{{
                p.status
              }}</span>
            </td>
            <td>
              <button class="btn-text">編輯</button>
              <button class="btn-text danger">刪除</button>
            </td>
          </tr>
          <tr v-if="filteredList.length === 0">
            <td colspan="6" class="empty-state">查無符合條件的參與者</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.participants-view {
  padding: 30px;
  background: #f8fafc;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  .title {
    font-size: 1.5rem;
    font-weight: 800;
    color: #1e293b;
    margin: 0;
  }
  .subtitle {
    color: #475569;
    margin-top: 4px;
    font-size: 0.9rem;
  }
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* 按鈕樣式 */
.btn-import {
  background: white;
  border: 1px solid #e2e8f0;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
}
.btn-export {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
  padding: 10px 18px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
}
.btn-primary {
  background: #0ea5e9;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
}

/* 過濾器列設計 */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  margin-bottom: 24px;
  background: white;
  border-radius: 16px;
  border: 1px solid #e2e8f0;

  .search-wrapper {
    flex: 1;
    max-width: 320px;
    position: relative;
    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: #475569;
    }
    .search-input {
      width: 100%;
      padding: 10px 42px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #f8fafc;
      outline: none;
      &:focus {
        border-color: #0ea5e9;
      }
    }
  }

  .filter-options {
    display: flex;
    gap: 20px;
    .filter-item {
      display: flex;
      align-items: center;
      gap: 10px;
      label {
        font-size: 0.85rem;
        font-weight: 700;
        color: #475569;
      }
    }
  }

  .select-rounded {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: white;
    font-size: 0.85rem;
    outline: none;
    cursor: pointer;
    min-width: 130px;
    &:focus {
      border-color: #0ea5e9;
    }
  }
}

/* 表格樣式 */
.table-container {
  background: white;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  padding: 0;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  th {
    background: #f8fafc;
    padding: 16px 24px;
    text-align: left;
    font-size: 0.85rem;
    color: #475569;
  }
  td {
    padding: 16px 24px;
    border-bottom: 1px solid #f1f5f9;
  }
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  .avatar {
    width: 34px;
    height: 34px;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.9rem;
  }
  .name {
    font-weight: 700;
    color: #1e293b;
  }
  .email-sub {
    font-size: 0.75rem;
    color: #94a3b8;
  }
}

.title-sub {
  font-size: 0.75rem;
  color: #94a3b8;
}

.tag {
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 800;
  &.vip {
    background: #fef3c7;
    color: #d97706;
  }
  &.attendee {
    background: #e0f2fe;
    color: #0369a1;
  }
  &.staff {
    background: #f1f5f9;
    color: #475569;
  }
}

.status-dot {
  position: relative;
  padding-left: 15px;
  font-size: 0.85rem;
  color: #475569;
  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    background: #cbd5e1;
    border-radius: 50%;
  }
  &.check {
    color: #10b981;
    font-weight: 600;
    &::before {
      background: #10b981;
    }
  }
}

.btn-text {
  background: none;
  border: none;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  margin-right: 12px;
  &:hover {
    color: #0ea5e9;
  }
  &.danger:hover {
    color: #ef4444;
  }
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #94a3b8;
  font-style: italic;
}
</style>
