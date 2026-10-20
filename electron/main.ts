import { app, BrowserWindow, ipcMain, screen, clipboard, nativeImage, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let lastClipboardImageHash = ''
let clipboardPollInterval: NodeJS.Timeout | null = null
let mediaPollInterval: NodeJS.Timeout | null = null
let batteryPollInterval: NodeJS.Timeout | null = null

let lastMediaSignature = ''
let lastBatterySignature = ''

const tempDir = path.join(os.tmpdir(), 'dynasis-screenshots')
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}

function getScriptPath(scriptName: string): string {
  const candidates = [
    path.join(__dirname, '../electron/scripts', scriptName),
    path.join(__dirname, 'scripts', scriptName),
    path.join(process.cwd(), 'electron/scripts', scriptName),
    path.join(app.getAppPath(), 'electron/scripts', scriptName),
    path.join(process.resourcesPath, 'scripts', scriptName),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

function runPowerShellScript(scriptName: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = getScriptPath(scriptName)
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout.trim())
        }
      }
    )
  })
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize

  // Start with compact island dimensions
  const initialWidth = 240
  const initialHeight = 58
  const x = Math.round((screenWidth - initialWidth) / 2)
  const y = 0

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  // Keep on top of other windows
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // When webContents is ready, send initial system state
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const mediaOut = await runPowerShellScript('get-media.ps1')
      if (mediaOut && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', JSON.parse(mediaOut))
      }
      const batteryOut = await runPowerShellScript('get-battery.ps1')
      if (batteryOut && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('battery-state-changed', JSON.parse(batteryOut))
      }
    } catch (err) {
      console.error('Initial state dispatch error:', err)
    }
  })

  // Start background services
  startClipboardWatcher()
  startMediaWatcher()
  startBatteryWatcher()
}

// Dynamic window resizing from renderer
ipcMain.on('set-island-size', (_event, { width, height }: { width: number; height: number }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize
  const targetW = Math.round(width)
  const targetH = Math.round(height)
  const x = Math.round((screenWidth - targetW) / 2)
  mainWindow.setBounds({ x, y: 0, width: targetW, height: targetH })
})

// Optional click-through if explicit (default is false)
ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options: { forward?: boolean } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, { forward: options.forward ?? false })
  }
})

function startClipboardWatcher() {
  clipboardPollInterval = setInterval(() => {
    try {
      const image = clipboard.readImage()
      if (image.isEmpty()) return

      const size = image.getSize()
      if (size.width === 0 || size.height === 0) return

      const buffer = image.toPNG()
      const hash = `${size.width}x${size.height}_${buffer.length}_${buffer.slice(0, 32).toString('hex')}`

      if (hash !== lastClipboardImageHash) {
        lastClipboardImageHash = hash
        const timestamp = Date.now()
        const fileName = `screenshot_${timestamp}.png`
        const filePath = path.join(tempDir, fileName)

        fs.writeFileSync(filePath, buffer)
        const dataUrl = image.toDataURL()

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('screenshot-captured', {
            id: `ss_${timestamp}`,
            filePath,
            dataUrl,
            timestamp,
            size,
          })
        }
      }
    } catch (err) {
      console.error('Clipboard watcher error:', err)
    }
  }, 800)
}

function startMediaWatcher() {
  const checkMedia = async () => {
    try {
      const output = await runPowerShellScript('get-media.ps1')
      if (output && output !== lastMediaSignature) {
        lastMediaSignature = output
        const data = JSON.parse(output)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('media-state-changed', data)
        }
      }
    } catch {
      // Ignore transient errors
    }
  }

  mediaPollInterval = setInterval(checkMedia, 1500)
}

function startBatteryWatcher() {
  const checkBattery = async () => {
    try {
      const output = await runPowerShellScript('get-battery.ps1')
      if (output && output !== lastBatterySignature) {
        lastBatterySignature = output
        const data = JSON.parse(output)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('battery-state-changed', data)
        }
      }
    } catch {
      // Ignore transient errors
    }
  }

  batteryPollInterval = setInterval(checkBattery, 4000)
}

// IPC Handlers
ipcMain.handle('get-current-media', async () => {
  try {
    const output = await runPowerShellScript('get-media.ps1')
    if (output) return JSON.parse(output)
  } catch (err) {
    console.error('get-current-media error:', err)
  }
  return { hasMedia: false }
})

ipcMain.handle('get-current-battery', async () => {
  try {
    const output = await runPowerShellScript('get-battery.ps1')
    if (output) return JSON.parse(output)
  } catch (err) {
    console.error('get-current-battery error:', err)
  }
  return { hasBattery: false }
})

ipcMain.on('start-file-drag', (event, filePath: string) => {
  if (fs.existsSync(filePath)) {
    event.sender.startDrag({
      file: filePath,
      icon: nativeImage.createFromPath(filePath).resize({ width: 64, height: 64 }),
    })
  }
})

ipcMain.on('media-action', async (_event, action: string) => {
  try {
    await runPowerShellScript('control-media.ps1', [action])
    // Re-check media status immediately after action
    setTimeout(async () => {
      const output = await runPowerShellScript('get-media.ps1')
      if (output && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', JSON.parse(output))
      }
    }, 200)
  } catch (err) {
    console.error('Media action error:', err)
  }
})

ipcMain.handle('save-screenshot', async (_event, dataUrl: string) => {
  if (!mainWindow) return null
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Screenshot',
    defaultPath: `Dynasis_Screenshot_${Date.now()}.png`,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })

  if (filePath) {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    return filePath
  }
  return null
})

ipcMain.handle('copy-image-to-clipboard', async (_event, dataUrl: string) => {
  try {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
    return true
  } catch (err) {
    console.error('Error copying image:', err)
    return false
  }
})

ipcMain.on('dismiss-screenshot', (_event, _id: string) => {
  // Optional cleanup
})

ipcMain.on('app-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('app-close', () => {
  app.quit()
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (clipboardPollInterval) clearInterval(clipboardPollInterval)
  if (mediaPollInterval) clearInterval(mediaPollInterval)
  if (batteryPollInterval) clearInterval(batteryPollInterval)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
