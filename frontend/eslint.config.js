import js from '@eslint/js'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'scryer']),
  {
    files: ['logic/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      // `ort` is the onnxruntime-web CDN global used by emotions.js.
      globals: { ...globals.browser, ort: 'readonly' },
    },
  },
])
