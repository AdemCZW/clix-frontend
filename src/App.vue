<script setup lang="ts">
import { RouterView } from "vue-router";
import Toast from "./components/Toast.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";

import { useConfirm } from "./composables/useConfirm";
import { useTheme } from "./composables/useTheme";

const { visible: confirmVisible, options: confirmOpts, handleConfirm, handleCancel } = useConfirm();
useTheme(); // 初始化主題
</script>

<template>
  <RouterView />
  <Toast />
  <ConfirmDialog
    :show="confirmVisible"
    :title="confirmOpts.title"
    :message="confirmOpts.message"
    :confirm-text="confirmOpts.confirmText"
    :cancel-text="confirmOpts.cancelText"
    :danger="confirmOpts.danger ?? true"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>

<style>
/* 這裡不需要 scoped，因為這是影響全域的根節點 */
#app {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
  font-weight: normal;
}

/* 清除預設樣版可能殘留的居中樣式 */
body {
  margin: 0;
  display: block;
  place-items: unset;
}
</style>
