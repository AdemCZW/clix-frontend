<script setup>
import LiveSeatMonitor from "@/components/LiveSeatMonitor.vue";

const handleClose = () => {
  // 如果是從新分頁開啟，關閉分頁；否則返回上一頁
  if (window.history.length <= 1 || window.opener) {
    window.close();
  } else {
    window.history.back();
  }
};
</script>

<template>
  <LiveSeatMonitor @close="handleClose" />
</template>
