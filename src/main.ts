// 1. 移除預設的 main.css，替換為自定義的文靜科技感樣式
import './styles/main.scss'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

// 2. 插件掛載
app.use(createPinia())
app.use(router)

// 3. 實體掛載
app.mount('#app')
