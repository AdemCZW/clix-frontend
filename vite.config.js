import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import fs from 'node:fs'

export default defineConfig(({ mode }) => {
    return {
        // 自訂網域不需要子路徑，直接用根目錄
        base: '/',

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
            outDir: 'docs', // 輸出到 docs 資料夾
            emptyOutDir: true, // 每次打包先清空舊檔
            assetsDir: 'assets',
            // 關鍵修正：解決 GitHub Pages 404 底線檔案問題
            rollupOptions: {
                output: {
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
