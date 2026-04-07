<template>
  <div class="company-info-page">
    <PageLoader v-if="loading" text="載入中..." />

    <template v-else>
    <div class="page-container">
      <!-- 頂部儲存列 -->
      <div class="top-bar">
        <span class="save-hint" v-if="saving">儲存中...</span>
        <button type="button" class="btn-save" :disabled="saving" @click="saveCompanyInfo">{{ saving ? '儲存中...' : '儲存設定' }}</button>
      </div>

      <!-- 左右兩欄：基本資訊 / 聯絡人 -->
      <div class="two-col">
        <div class="card">
          <h3 class="card-title">基本資訊</h3>
          <div class="fg">
            <label>公司名稱 <span class="req">*</span></label>
            <input v-model="companyInfo.name" type="text" placeholder="請輸入公司名稱" required class="fi" />
          </div>
          <div class="row2">
            <div class="fg">
              <label>統一編號</label>
              <input v-model="companyInfo.taxId" type="text" placeholder="12345678" class="fi" maxlength="8" />
              <span class="hint">8 碼數字</span>
            </div>
            <div class="fg">
              <label>聯絡電話 <span class="req">*</span></label>
              <input v-model="companyInfo.phone" type="tel" placeholder="02-1234-5678" required class="fi" />
              <span class="hint">格式：02-1234-5678 或 0912-345-678</span>
            </div>
          </div>
          <div class="fg">
            <label>聯絡信箱 <span class="req">*</span></label>
            <input v-model="companyInfo.email" type="email" placeholder="contact@company.com" required class="fi" :class="{ 'fi-error': companyInfo.email && !isValidEmail(companyInfo.email) }" />
            <span v-if="companyInfo.email && !isValidEmail(companyInfo.email)" class="hint error">請輸入正確的信箱格式</span>
          </div>
          <div class="fg">
            <label>公司地址</label>
            <input v-model="companyInfo.address" type="text" placeholder="例：台北市信義區信義路五段7號" class="fi" />
          </div>
          <div class="fg">
            <label>公司網站</label>
            <input v-model="companyInfo.website" type="url" placeholder="https://www.example.com" class="fi" :class="{ 'fi-error': companyInfo.website && !isValidUrl(companyInfo.website) }" />
            <span v-if="companyInfo.website && !isValidUrl(companyInfo.website)" class="hint error">請輸入正確的網址（以 http:// 或 https:// 開頭）</span>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">聯絡人資訊</h3>
          <div class="fg">
            <label>聯絡人姓名</label>
            <input v-model="companyInfo.contactName" type="text" placeholder="王大明" class="fi" />
          </div>
          <div class="fg">
            <label>聯絡人職稱</label>
            <input v-model="companyInfo.contactTitle" type="text" placeholder="活動企劃經理" class="fi" />
          </div>
          <div class="fg">
            <label>聯絡人電話</label>
            <input v-model="companyInfo.contactPhone" type="tel" placeholder="0912-345-678" class="fi" />
          </div>
          <div class="fg">
            <label>聯絡人信箱</label>
            <input v-model="companyInfo.contactEmail" type="email" placeholder="contact@company.com" class="fi" :class="{ 'fi-error': companyInfo.contactEmail && !isValidEmail(companyInfo.contactEmail) }" />
            <span v-if="companyInfo.contactEmail && !isValidEmail(companyInfo.contactEmail)" class="hint error">請輸入正確的信箱格式</span>
          </div>
        </div>
      </div>

      <!-- 下方全寬：公司簡介 -->
      <div class="card" style="margin-top:12px;">
        <h3 class="card-title">公司簡介</h3>
        <div class="fg">
          <textarea v-model="companyInfo.description" rows="4" placeholder="簡要介紹您的公司或主辦單位..." class="fi ta"></textarea>
          <span class="hint">此內容可能顯示在活動報名頁面上</span>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";
import { useToast } from "@/composables/useToast";
import { apiRequest } from "@/utils/api";
import { parseApiError } from "@/utils/parseApiError";
import PageLoader from "@/components/shared/PageLoader.vue";

const { success, error: toastError } = useToast();

const loading = ref(false);
const saving = ref(false);

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUrl = (url: string) => /^https?:\/\/.+/.test(url);

const companyInfo = reactive({
  name: "",
  taxId: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  contactName: "",
  contactTitle: "",
  contactPhone: "",
  contactEmail: "",
  description: "",
});

// 後端 snake_case → 前端 camelCase
const mapFromApi = (data) => {
  companyInfo.name         = data.name          ?? "";
  companyInfo.taxId        = data.tax_id        ?? "";
  companyInfo.phone        = data.phone         ?? "";
  companyInfo.email        = data.email         ?? "";
  companyInfo.address      = data.address       ?? "";
  companyInfo.website      = data.website       ?? "";
  companyInfo.contactName  = data.contact_name  ?? "";
  companyInfo.contactTitle = data.contact_title ?? "";
  companyInfo.contactPhone = data.contact_phone ?? "";
  companyInfo.contactEmail = data.contact_email ?? "";
  companyInfo.description  = data.description   ?? "";
};

onMounted(async () => {
  loading.value = true;
  try {
    const res = await apiRequest("/api/organizer-info/");
    if (!res.ok) throw new Error(await parseApiError(res, "載入主辦單位資訊失敗"));
    mapFromApi(await res.json());
  } catch (err: unknown) {
    toastError((err as Error).message || "載入失敗");
  } finally {
    loading.value = false;
  }
});

const saveCompanyInfo = async () => {
  saving.value = true;
  try {
    const res = await apiRequest("/api/organizer-info/", {
      method: "PATCH",
      body: JSON.stringify({
        name:          companyInfo.name,
        tax_id:        companyInfo.taxId,
        phone:         companyInfo.phone,
        email:         companyInfo.email,
        address:       companyInfo.address,
        website:       companyInfo.website,
        contact_name:  companyInfo.contactName,
        contact_title: companyInfo.contactTitle,
        contact_phone: companyInfo.contactPhone,
        contact_email: companyInfo.contactEmail,
        description:   companyInfo.description,
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res, "儲存失敗"));
    mapFromApi(await res.json());
    success("主辦單位資訊已儲存！");
  } catch (err: unknown) {
    toastError((err as Error).message || "儲存失敗，請稍後再試");
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.company-info-page {
  min-height: 100%;
  background: var(--bg-primary);
  padding: 12px;
}
.page-container { max-width: 1100px; margin: 0 auto; }

/* 頂部列 */
.top-bar {
  display: flex; justify-content: flex-end; align-items: center;
  gap: 10px; margin-bottom: 12px;
}
.save-hint { font-size: .82rem; color: var(--text-muted); }
.btn-save {
  padding: 7px 20px; background: #6366f1; color: #fff;
  border: none; border-radius: 8px; font-size: .84rem; font-weight: 600;
  cursor: pointer; transition: .15s;
}
.btn-save:hover:not(:disabled) { background: #4f46e5; }
.btn-save:disabled { opacity: .5; cursor: not-allowed; }

/* 兩欄 */
.two-col {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; align-items: start;
}

/* 卡片 */
.card {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 10px; padding: 16px; margin-bottom: 12px;
}
.card-title {
  font-size: .92rem; font-weight: 700; color: var(--text-main);
  margin: 0 0 12px; padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

/* 欄位 */
.fg { margin-bottom: 14px; }
.fg:last-child { margin-bottom: 0; }
.fg label {
  display: block; font-size: .82rem; font-weight: 600;
  color: var(--text-secondary); margin-bottom: 4px;
}
.req { color: #ef4444; }
.fi {
  width: 100%; padding: 8px 12px;
  border: 1px solid var(--border-color); border-radius: 8px;
  font-size: .88rem; background: var(--bg-card); color: var(--text-main);
  transition: .15s; outline: none; font-family: inherit;
}
.fi:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.1); }
.fi::placeholder { color: var(--text-muted); }
.fi-error { border-color: #ef4444 !important; }
.fi-error:focus { box-shadow: 0 0 0 2px rgba(239,68,68,.1) !important; }
.ta { resize: vertical; min-height: 100px; }
.hint {
  display: block; font-size: .72rem; color: var(--text-muted);
  margin-top: 3px;
}
.hint.error { color: #ef4444; }

/* 兩欄排列 */
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* RWD */
@media (max-width: 1024px) {
  .two-col { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .company-info-page { padding: 8px; }
  .row2 { grid-template-columns: 1fr; gap: 0; }
  .btn-save { width: 100%; }
}
</style>
