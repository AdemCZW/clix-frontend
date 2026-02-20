import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default defineConfig([{
        name: 'app/files-to-lint',
        files: ['**/*.{vue,js,mjs,jsx}'],
    },

    globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/docs/**']),

    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            ecmaVersion: 2022,
            sourceType: 'module',
        },
    },

    js.configs.recommended,
    ...pluginVue.configs['flat/essential'],

    {
        rules: {
            // 關閉會干擾現代 JS 語法的規則
            'no-unused-vars': 'warn',
            'vue/multi-word-component-names': 'off',
        },
    },
])
