<template>
  <div class="company-info-page">
    <div class="page-container">
      <div class="page-header">
        <h1 class="page-title">主辦單位資訊</h1>
        <p class="page-description">管理您的主辦單位基本資訊</p>
      </div>

      <div class="content-panel">
        <form @submit.prevent="saveCompanyInfo" class="company-form">
          <div class="form-section">
            <h3 class="section-title">基本資訊</h3>

            <div class="form-row">
              <div class="form-group">
                <label>公司名稱 *</label>
                <input
                  v-model="companyInfo.name"
                  type="text"
                  placeholder="請輸入公司名稱"
                  required
                />
              </div>

              <div class="form-group">
                <label>統一編號</label>
                <input v-model="companyInfo.taxId" type="text" placeholder="請輸入統一編號" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>聯絡電話 *</label>
                <input
                  v-model="companyInfo.phone"
                  type="tel"
                  placeholder="請輸入聯絡電話"
                  required
                />
              </div>

              <div class="form-group">
                <label>聯絡信箱 *</label>
                <input
                  v-model="companyInfo.email"
                  type="email"
                  placeholder="請輸入聯絡信箱"
                  required
                />
              </div>
            </div>

            <div class="form-group full-width">
              <label>公司地址</label>
              <input v-model="companyInfo.address" type="text" placeholder="請輸入公司地址" />
            </div>

            <div class="form-group full-width">
              <label>公司網站</label>
              <input v-model="companyInfo.website" type="url" placeholder="https://" />
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">聯絡人資訊</h3>

            <div class="form-row">
              <div class="form-group">
                <label>聯絡人姓名</label>
                <input
                  v-model="companyInfo.contactName"
                  type="text"
                  placeholder="請輸入聯絡人姓名"
                />
              </div>

              <div class="form-group">
                <label>聯絡人職稱</label>
                <input v-model="companyInfo.contactTitle" type="text" placeholder="請輸入職稱" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>聯絡人電話</label>
                <input
                  v-model="companyInfo.contactPhone"
                  type="tel"
                  placeholder="請輸入聯絡人電話"
                />
              </div>

              <div class="form-group">
                <label>聯絡人信箱</label>
                <input
                  v-model="companyInfo.contactEmail"
                  type="email"
                  placeholder="請輸入聯絡人信箱"
                />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">其他資訊</h3>

            <div class="form-group full-width">
              <label>公司簡介</label>
              <textarea
                v-model="companyInfo.description"
                rows="5"
                placeholder="請輸入公司簡介..."
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">儲存設定</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";
import { useToast } from "@/composables/useToast";
import { apiRequest } from "@/utils/api";
import { parseApiError } from "@/utils/parseApiError";

const { success, error: toastError } = useToast();

const loading = ref(false);
const saving = ref(false);

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

<style lang="scss" scoped>
.company-info-page {
  min-height: 100%;
  background: var(--bg-primary, #f8f9fa);
}

.page-container {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-main, #1f2937);
    margin: 0 0 8px 0;
  }

  .page-description {
    color: var(--text-muted, #6b7280);
    margin: 0;
    font-size: 0.95rem;
  }
}

.content-panel {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.company-form {
  .form-section {
    margin-bottom: 32px;

    &:last-child {
      margin-bottom: 0;
    }

    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-main, #1f2937);
      margin: 0 0 20px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--border-light, #e5e7eb);
    }
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .form-group {
    margin-bottom: 20px;

    &.full-width {
      grid-column: 1 / -1;
    }

    &:last-child {
      margin-bottom: 0;
    }

    label {
      display: block;
      font-weight: 600;
      color: var(--text-main, #374151);
      margin-bottom: 8px;
      font-size: 0.9rem;
    }

    input,
    textarea {
      width: 100%;
      padding: 10px 14px;
      border: 2px solid var(--border-light, #e5e7eb);
      border-radius: 8px;
      font-size: 0.95rem;
      transition: all 0.2s ease;
      font-family: inherit;

      &:focus {
        outline: none;
        border-color: var(--primary-blue, #3b82f6);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      &::placeholder {
        color: #9ca3af;
      }
    }

    textarea {
      resize: vertical;
      min-height: 100px;
    }
  }
}

.form-actions {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid var(--border-light, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-primary {
  background: var(--primary-blue, #3b82f6);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>
