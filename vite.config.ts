import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let initialCleanupDone = false

/**
 * Kill only Electron processes that belong to THIS checkout.
 *
 * The previous implementation ran `taskkill /F /IM electron.exe /T`, which
 * matches every Electron process on the machine (other electron-based dev
 * apps and any other project's dev instance), not just stale Dynasis ones.
 *
 * Matching by the absolute path of this project's own electron.exe keeps the
 * cleanup scoped to processes started from this repo.
 */
function killStaleProjectElectron() {
  if (process.platform !== 'win32') return

  const electronExe = path.resolve(__dirname, 'node_modules/electron/dist/electron.exe')
  if (!fs.existsSync(electronExe)) return

  const escapedExe = electronExe.replace(/'/g, "''")
  const script = `
$target = [System.IO.Path]::GetFullPath('${escapedExe}')
$stale = @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" | Where-Object {
  $_.ExecutablePath -and [string]::Equals(
    [System.IO.Path]::GetFullPath($_.ExecutablePath),
    $target,
    [System.StringComparison]::OrdinalIgnoreCase
  )
})
foreach ($proc in $stale) {
  try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {}
}
Write-Output $stale.Count
`

  try {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }
    )
    const killed = Number.parseInt(output.trim(), 10)
    if (Number.isFinite(killed) && killed > 0) {
      console.log(`[dev] stopped ${killed} stale Dynasis Electron process(es)`)
    }
  } catch {
    // Best effort only: never block dev startup.
  }
}

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
            killStaleProjectElectron()
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
