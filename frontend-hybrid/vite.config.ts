import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Read version from local VERSION file first, fallback to root VERSION
let majorVersion = '0.0.0'
for (const candidate of ['./VERSION', '../VERSION']) {
  try {
    majorVersion = fs.readFileSync(path.resolve(__dirname, candidate), 'utf-8').trim()
    break
  } catch {
    // try next candidate
  }
}
const now = new Date()
const buildTimestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
const version = `${majorVersion}+${buildTimestamp}`

const backendPort = process.env.BACKEND_PORT || '8000'

export default defineConfig({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
        alias: [
            { find: '@', replacement: path.resolve(__dirname, './src') },
            // 数字员工本地壳层：把上游的 OpenClaw 接入指引重定向到品牌版
            //（数字员工/digitaleemployee_sync），上游文件保持原样不动。
            { find: /^\.*\/utils\/openClawInstruction$/, replacement: path.resolve(__dirname, './src/local/openClawInstruction.ts') },
        ],
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-charts': ['recharts'],
                    'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
                    'vendor-icons': ['@tabler/icons-react'],
                },
            },
        },
    },
    server: {
        port: 3008,
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: `http://localhost:${backendPort}`,
                changeOrigin: true,
            },
            '/ws': {
                target: `ws://localhost:${backendPort}`,
                ws: true,
            },
        },
    },
})
