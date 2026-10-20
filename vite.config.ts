import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let initialCleanupDone = false

function copyNativePreload() {
  const outDir = path.resolve(__dirname, 'dist-electron')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  fs.copyFileSync(
    path.resolve(__dirname, 'electron/preload.cjs'),
    path.resolve(outDir, 'preload.cjs')
  )
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-native-preload-cjs',
      buildStart() {
        copyNativePreload()
      },
    },
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          copyNativePreload()
          if (!initialCleanupDone) {
            initialCleanupDone = true
            try {
              execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' })
            } catch {
              // No stale electron.exe running
            }
          }
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'fs', 'path', 'os', 'child_process', 'url'],
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
