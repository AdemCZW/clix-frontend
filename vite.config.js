import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import fs from 'node:fs'

export default defineConfig(({ mode }) => {
    return {
        // 官網首頁改放靜態行銷頁（docs/ 根目錄），Vue 系統本體搬到 /app/ 子路徑
        base: '/app/',

        plugins: [
            vue(),
            // vueDevTools 只在開發環境啟用，production build 不注入
            ...(mode === 'development' ? [vueDevTools()] : []),
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src',
                    import.meta.url))
            },
        },
        server: {
            host: '0.0.0.0',
            https: fs.existsSync('./localhost-cert.pem') ? {
                key: fs.readFileSync('./localhost-key.pem'),
                cert: fs.readFileSync('./localhost-cert.pem'),
            } : undefined,
            proxy: {
                // 開發環境將所有 /api/* 轉發到後端，避免 CORS 問題
                // 若後端不在 localhost:8000，可建立 .env 並設定 VITE_API_BASE_URL
                '/api': {
                    target: 'http://localhost:8000',
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
        build: {
            outDir: 'docs/app', // Vue 系統本體輸出到 docs/app，docs/ 根目錄留給行銷首頁
            emptyOutDir: true, // 每次打包先清空舊檔
            assetsDir: 'assets',
            // 關鍵修正：解決 GitHub Pages 404 底線檔案問題
            rollupOptions: {
                output: {
                    // 大型 library 獨立分包，避免單一 chunk 過大
                    manualChunks(id) {
                        if (id.includes('node_modules/xlsx')) return 'vendor-xlsx'
                        if (id.includes('node_modules/quill') || id.includes('node_modules/@vueup/vue-quill')) return 'vendor-quill'
                        if (id.includes('node_modules/jsqr') || id.includes('node_modules/qrcode')) return 'vendor-qr'
                    },
                    // 將所有以底線開頭的檔案重新命名，移除底線
                    sanitizeFileName(name) {
                        // 一些 plugin 回傳的 module id 可能包含 null 字元或特殊字元
                        //（例如: "\0plugin-vue:export-helper-..."），直接寫入檔案會導致
                        // Node.js 觸發 Invalid ARG 錯誤。這裡先移除 null 與不允許的字元。
                        const clean = String(name)
                            .split(String.fromCharCode(0)).join('') // 移除 null bytes
                            .replace(new RegExp('[:/\\\\]', 'g'), '-'); // 將冒號與路徑分隔符替換為短横線

                        const match = /^_data(.*)/.exec(clean);
                        if (match) {
                            return "data" + match[1];
                        }
                        return clean.replace(/^_/, ""); // 移除開頭的底線
                    },
                },
            },
        }
    }
})
