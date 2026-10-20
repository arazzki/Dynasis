import { app, BrowserWindow, ipcMain, screen, clipboard, nativeImage, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let lastClipboardImageHash = ''
let clipboardPollInterval: NodeJS.Timeout | null = null

const tempDir = path.join(os.tmpdir(), 'dynasis-screenshots')
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize

  const windowWidth = 720
  const windowHeight = 360
  const x = Math.round((screenWidth - windowWidth) / 2)
  const y = 0

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
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

  // Start with click-through enabled on transparent areas
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Handle IPC for click-through toggling
  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options: { forward?: boolean } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, { forward: options.forward ?? true })
    }
  })

  // Start clipboard watcher for screenshots
  startClipboardWatcher()
}

function startClipboardWatcher() {
  clipboardPollInterval = setInterval(() => {
    try {
      const image = clipboard.readImage()
      if (image.isEmpty()) return

      const size = image.getSize()
      if (size.width === 0 || size.height === 0) return

      // Use a fast hash based on dimensions and data preview
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

// IPC Handlers
ipcMain.on('start-file-drag', (event, filePath: string) => {
  if (fs.existsSync(filePath)) {
    event.sender.startDrag({
      file: filePath,
      icon: nativeImage.createFromPath(filePath).resize({ width: 64, height: 64 }),
    })
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
  // Can clean up temp files if desired
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
