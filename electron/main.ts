import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  clipboard,
  nativeImage,
  dialog,
  globalShortcut,
  Tray,
  Menu,
  shell,
} from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import zlib from 'zlib'
import { execFile, execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Fixed canvas size (coucou architecture: never clips spring animations, click-through outside islandRect)
const PANEL_W = 680
const PANEL_H = 280
const HIT_MARGIN = 12
const WAKE_STRIP_W = 200
const WAKE_STRIP_H = 6

// Prevent Windows GPU/HTTP disk cache lock contention
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-program-cache')

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.webContents.send('tray-command', 'open')
  }
})

let lastClipboardImageHash = ''
let lastClipboardText = ''
let clipboardPollInterval: NodeJS.Timeout | null = null
let mediaPollInterval: NodeJS.Timeout | null = null
let batteryPollInterval: NodeJS.Timeout | null = null
let appsPollInterval: NodeJS.Timeout | null = null
let cursorPollInterval: NodeJS.Timeout | null = null

let lastMediaSignature = ''
let lastTrackKey = ''
let cachedAlbumArt: string | null = null
let lastBatterySignature = ''
let lastAppsSignature = ''
let lastWaNotifId = ''
let initializedWaNotif = false

// Current active island bounding box in window-logical coordinates (starts in Stealth Edge hidden mode)
let islandRect = {
  x: (PANEL_W - 200) / 2,
  y: 0,
  w: 200,
  h: 6,
}
let isIgnoringMouse = true
let lastCursor = { x: -9999, y: -9999, onIsland: false, onWakeStrip: false }

let userCustomX: number | null = null
let userCustomY: number | null = null

const tempDir = path.join(os.tmpdir(), 'dynasis-screenshots')
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}

function isPhysicalPath(p: string): boolean {
  const lower = p.toLowerCase()
  if (lower.includes('app.asar') && !lower.includes('app.asar.unpacked')) {
    return false
  }
  return fs.existsSync(p)
}

function getPreloadPath(): string {
  const candidates = [
    path.join(process.resourcesPath, 'app/electron/preload.cjs'),
    path.join(process.resourcesPath, 'app.asar.unpacked/electron/preload.cjs'),
    path.join(process.cwd(), 'electron/preload.cjs'),
    path.join(__dirname, '../electron/preload.cjs'),
    path.join(__dirname, 'preload.cjs'),
  ]
  for (const p of candidates) {
    if (isPhysicalPath(p)) return p
  }
  return candidates[0]
}

function getScriptPath(scriptName: string): string {
  const candidates = [
    path.join(process.resourcesPath, 'scripts', scriptName),
    path.join(process.resourcesPath, 'app/electron/scripts', scriptName),
    path.join(process.resourcesPath, 'app.asar.unpacked/electron/scripts', scriptName),
    path.join(process.cwd(), 'electron/scripts', scriptName),
    path.join(__dirname, '../electron/scripts', scriptName),
    path.join(__dirname, 'scripts', scriptName),
  ]
  for (const p of candidates) {
    if (isPhysicalPath(p)) return p
  }
  return candidates[0]
}

function runPowerShellScript(scriptName: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = getScriptPath(scriptName)
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
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

async function fetchMediaState(forceFreshArt = false): Promise<any | null> {
  try {
    const canUseCache = !forceFreshArt && Boolean(lastTrackKey && cachedAlbumArt)
    const args = canUseCache ? ['-LastTrackKey', lastTrackKey] : []
    const output = await runPowerShellScript('get-media.ps1', args)
    if (!output) return null
    const data = JSON.parse(output)
    if (data.hasMedia) {
      if (data.albumArtCached && cachedAlbumArt) {
        data.albumArt = cachedAlbumArt
      } else if (data.albumArt) {
        cachedAlbumArt = data.albumArt
      }
      if (data.trackKey) {
        lastTrackKey = data.trackKey
      }
    } else {
      lastTrackKey = ''
      cachedAlbumArt = null
    }
    return data
  } catch {
    return null
  }
}

/**
 * Generates a crisp 32x32 RGBA PNG icon in-memory for the Windows System Tray
 * (Black rounded pill with an emerald glowing core).
 */
function createTrayPngBuffer(): Buffer {
  const w = 32
  const h = 32
  const raw = Buffer.alloc((w * 4 + 1) * h)

  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1)
    raw[rowStart] = 0 // PNG filter type 0
    for (let x = 0; x < w; x++) {
      const idx = rowStart + 1 + x * 4
      const dx = Math.abs(x - 15.5)
      const dy = Math.abs(y - 15.5)
      // Rounded square / circle icon
      const dist = Math.hypot(Math.max(0, dx - 6), Math.max(0, dy - 6))
      if (dist <= 8.5) {
        // Inside icon background (dark obsidian)
        const dotDist = Math.hypot(x - 15.5, y - 15.5)
        if (dotDist <= 5.2) {
          // Emerald core (#10b981)
          raw[idx] = 16
          raw[idx + 1] = 185
          raw[idx + 2] = 129
          raw[idx + 3] = 255
        } else {
          raw[idx] = 18
          raw[idx + 1] = 20
          raw[idx + 2] = 24
          raw[idx + 3] = 255
        }
      } else {
        raw[idx] = 0
        raw[idx + 1] = 0
        raw[idx + 2] = 0
        raw[idx + 3] = 0
      }
    }
  }

  function crc32(buf: Buffer): number {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
    }
    return (c ^ 0xffffffff) >>> 0
  }

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = zlib.deflateSync(raw)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function createTrayIcon(): Electron.NativeImage {
  return nativeImage.createFromBuffer(createTrayPngBuffer())
}

function ensureDynasisIcoFile(): string {
  const icoPath = path.join(tempDir, 'dynasis.ico')
  try {
    if (!fs.existsSync(icoPath)) {
      const png = createTrayPngBuffer()
      const header = Buffer.alloc(22)
      header.writeUInt16LE(0, 0) // Reserved
      header.writeUInt16LE(1, 2) // Type: 1 = ICO
      header.writeUInt16LE(1, 4) // Image count: 1
      header[6] = 32 // Width
      header[7] = 32 // Height
      header[8] = 0 // Color palette
      header[9] = 0 // Reserved
      header.writeUInt16LE(1, 10) // Color planes
      header.writeUInt16LE(32, 12) // Bits per pixel
      header.writeUInt32LE(png.length, 14) // Image byte size
      header.writeUInt32LE(22, 18) // Offset (6 + 16)
      fs.writeFileSync(icoPath, Buffer.concat([header, png]))
    }
  } catch {}
  return icoPath
}

const RUN_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const STARTUP_APPROVED_REG_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
const STARTUP_APPROVED_FOLDER_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
const MUI_CACHE_REG_KEY =
  'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'
const LEGACY_AUTOSTART_NAMES = ['Dynasis', 'electron.app.Dynasis', 'electron.app.Electron']

function getStartupShortcutPath(): string {
  return path.join(
    app.getPath('appData'),
    'Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Dynasis.lnk'
  )
}

function regValueExists(keyPath: string, valueName: string): boolean {
  try {
    execFileSync('reg.exe', ['query', keyPath, '/v', valueName], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function regDeleteValue(keyPath: string, valueName: string): void {
  try {
    execFileSync('reg.exe', ['delete', keyPath, '/v', valueName, '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  } catch {
    // Ignore if value does not exist
  }
}

function registerFriendlyAppNameInWindowsShell(): void {
  if (process.platform !== 'win32') return
  try {
    execFileSync(
      'reg.exe',
      [
        'add',
        MUI_CACHE_REG_KEY,
        '/v',
        `${process.execPath}.FriendlyAppName`,
        '/t',
        'REG_SZ',
        '/d',
        'Dynasis',
        '/f',
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    execFileSync(
      'reg.exe',
      [
        'add',
        MUI_CACHE_REG_KEY,
        '/v',
        `${process.execPath}.ApplicationCompany`,
        '/t',
        'REG_SZ',
        '/d',
        'Dynasis',
        '/f',
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
  } catch {}
}

function getAutoStartEnabled(): boolean {
  if (process.platform !== 'win32') {
    return app.getLoginItemSettings().openAtLogin
  }
  const lnkPath = getStartupShortcutPath()
  return (
    fs.existsSync(lnkPath) ||
    LEGACY_AUTOSTART_NAMES.some((name) => regValueExists(RUN_REG_KEY, name))
  )
}

function setAutoStartEnabled(enabled: boolean): boolean {
  if (process.platform !== 'win32') {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
    return app.getLoginItemSettings().openAtLogin
  }

  // Always remove Registry Run entries so Windows Task Manager doesn't read raw PE "Electron"
  for (const legacyName of LEGACY_AUTOSTART_NAMES) {
    regDeleteValue(RUN_REG_KEY, legacyName)
    regDeleteValue(STARTUP_APPROVED_REG_KEY, legacyName)
  }

  const lnkPath = getStartupShortcutPath()

  if (enabled) {
    try {
      const icoPath = ensureDynasisIcoFile()
      shell.writeShortcutLink(lnkPath, 'create', {
        target: process.execPath,
        cwd: path.dirname(process.execPath),
        description: 'Dynasis — Dynamic System Island',
        icon: icoPath,
        iconIndex: 0,
        appUserModelId: 'Dynasis',
      })
      regDeleteValue(STARTUP_APPROVED_FOLDER_KEY, 'Dynasis.lnk')
    } catch (err) {
      console.error('Failed to create Dynasis.lnk startup shortcut:', err)
    }
  } else {
    try {
      if (fs.existsSync(lnkPath)) {
        fs.unlinkSync(lnkPath)
      }
      regDeleteValue(STARTUP_APPROVED_FOLDER_KEY, 'Dynasis.lnk')
    } catch {}
  }

  return fs.existsSync(lnkPath)
}

function migrateAutoStartRegistry(): void {
  if (process.platform !== 'win32') return
  registerFriendlyAppNameInWindowsShell()
  const hasAny = getAutoStartEnabled()
  if (hasAny) {
    // Migrate any Registry Run entry into the clean Startup folder Dynasis.lnk shortcut
    setAutoStartEnabled(true)
  }
}

function updateTrayMenu() {
  if (!tray) return
  const isAutoStart = getAutoStartEnabled()
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Dynasis — Dynamic System Island',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Buka Dashboard (Overview)',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.show()
        mainWindow.webContents.send('tray-command', 'open')
      },
    },
    {
      label: 'Mode Compact Pill',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.show()
        mainWindow.webContents.send('tray-command', 'compact')
      },
    },
    {
      label: 'Mode Stealth (Lipat ke Tepi Atas)',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.show()
        mainWindow.webContents.send('tray-command', 'stealth')
      },
    },
    {
      label: 'Pengaturan (Settings)',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.show()
        mainWindow.webContents.send('tray-command', 'settings')
      },
    },
    { type: 'separator' },
    {
      label: 'Jalankan Otomatis Saat Windows Menyala',
      type: 'checkbox',
      checked: isAutoStart,
      click: (menuItem) => {
        setAutoStartEnabled(menuItem.checked)
        updateTrayMenu()
      },
    },
    {
      label: 'Reset Posisi ke Tengah Atas',
      click: () => {
        resetWindowPosition()
      },
    },
    { type: 'separator' },
    {
      label: 'Keluar dari Dynasis (Quit)',
      click: () => {
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
}

function setupSystemTray() {
  if (tray) return
  try {
    tray = new Tray(createTrayIcon())
    tray.setToolTip('Dynasis — Dynamic System Island (Alt+\\)')
    updateTrayMenu()
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.show()
      mainWindow.webContents.send('tray-command', 'open')
    })
  } catch (err) {
    console.error('Tray initialization error:', err)
  }
}

function resetWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  userCustomX = null
  userCustomY = null
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize
  const x = Math.round((screenWidth - PANEL_W) / 2)
  mainWindow.setBounds({ x, y: 0, width: PANEL_W, height: PANEL_H })
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize

  const x = Math.round((screenWidth - PANEL_W) / 2)
  const y = 0

  app.setName('Dynasis')
  mainWindow = new BrowserWindow({
    title: 'Dynasis',
    icon: createTrayIcon(),
    width: PANEL_W,
    height: PANEL_H,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    thickFrame: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  // Keep on top of all windows including taskbar/fullscreen overlays
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // When webContents is ready, send initial system state
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const mediaData = await fetchMediaState(true)
      if (mediaData && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', mediaData)
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
  startCursorPoll()
  startClipboardWatcher()
  startMediaWatcher()
  startBatteryWatcher()
  startAppsWatcher()
}

/**
 * Coucou-inspired 60Hz Main-Process Hit-Test Polling:
 * Centers the island hit-box relative to `bounds.width` so DPI scaling never shifts the hit area.
 */
function startCursorPoll() {
  if (cursorPollInterval) clearInterval(cursorPollInterval)

  cursorPollInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return

    try {
      const cursor = screen.getCursorScreenPoint()
      const bounds = mainWindow.getBounds()
      const x = cursor.x - bounds.x
      const y = cursor.y - bounds.y

      // Strictly 6px high wake strip at the very top edge so browser tabs (y >= 8) are never triggered accidentally
      const stripX0 = (bounds.width - WAKE_STRIP_W) / 2
      const onWakeStrip =
        x >= stripX0 &&
        x <= stripX0 + WAKE_STRIP_W &&
        y >= -4 &&
        y <= WAKE_STRIP_H

      // Only apply active island hit-box when island is awake (compact / expanded / battery, h > 10)
      const isAwake = islandRect.h > 10
      const rectX = (bounds.width - islandRect.w) / 2
      const rectY = islandRect.y

      const onIsland = isAwake
        ? x >= rectX - HIT_MARGIN &&
          x <= rectX + islandRect.w + HIT_MARGIN &&
          y >= -4 &&
          y <= rectY + islandRect.h + HIT_MARGIN
        : onWakeStrip

      const accept = onIsland || onWakeStrip
      const shouldIgnore = !accept

      if (shouldIgnore !== isIgnoringMouse) {
        isIgnoringMouse = shouldIgnore
        mainWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true })
      }

      const stateChanged =
        onIsland !== lastCursor.onIsland || onWakeStrip !== lastCursor.onWakeStrip
      const moved =
        Math.abs(x - lastCursor.x) >= 1 ||
        Math.abs(y - lastCursor.y) >= 1 ||
        stateChanged

      if (moved) {
        const nearWindow =
          x >= -40 && x <= bounds.width + 40 && y >= -20 && y <= bounds.height + 40

        lastCursor = { x, y, onIsland, onWakeStrip }
        if (nearWindow || stateChanged) {
          mainWindow.webContents.send('cursor-moved', { x, y, onIsland, onWakeStrip })
        }
      }
    } catch {
      // Ignore transient screen query errors
    }
  }, 16)
}

// Update active hit-test rectangle from renderer (coucou setIslandRect pattern)
ipcMain.on('set-island-rect', (_event, rect: { x: number; y: number; w: number; h: number }) => {
  if (!rect || typeof rect.w !== 'number') return
  islandRect = {
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
  }
})

ipcMain.on('set-island-size', (_event, { width, height }: { width: number; height: number }) => {
  islandRect = {
    x: (PANEL_W - width) / 2,
    y: 0,
    w: width,
    h: height,
  }
})

ipcMain.on('move-window-by', (_event, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const [currentX, currentY] = mainWindow.getPosition()
  userCustomX = currentX + Math.round(deltaX)
  userCustomY = Math.max(0, currentY + Math.round(deltaY))
  mainWindow.setPosition(userCustomX, userCustomY)
})

ipcMain.on('reset-window-position', () => {
  resetWindowPosition()
})

ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options: { forward?: boolean } = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    isIgnoringMouse = ignore
    win.setIgnoreMouseEvents(ignore, { forward: options.forward ?? true })
  }
})

function imageHash(image: Electron.NativeImage): string {
  const size = image.getSize()
  const buffer = image.toBitmap()
  return `${size.width}x${size.height}_${buffer.length}_${buffer.subarray(0, 64).toString('hex')}_${buffer.subarray(buffer.length >> 1, (buffer.length >> 1) + 64).toString('hex')}`
}

function startClipboardWatcher() {
  try {
    const initial = clipboard.readImage()
    if (!initial.isEmpty()) lastClipboardImageHash = imageHash(initial)
    lastClipboardText = (clipboard.readText() || '').trim()
  } catch {
    /* ignore */
  }

  clipboardPollInterval = setInterval(() => {
    try {
      // 1. Check for new copied text / URLs
      const rawText = (clipboard.readText() || '').trim()
      if (rawText && rawText.length >= 2 && rawText !== lastClipboardText) {
        lastClipboardText = rawText
        const timestamp = Date.now()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('clipboard-text-captured', {
            id: `txt_${timestamp}`,
            type: 'text',
            text: rawText.slice(0, 4000),
            name: /^https?:\/\//i.test(rawText)
              ? `Link: ${rawText.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 32)}`
              : `Teks: ${rawText.replace(/\s+/g, ' ').slice(0, 30)}`,
            dataUrl: '',
            timestamp,
          })
        }
      }

      // 2. Check for new screenshots / copied images
      const image = clipboard.readImage()
      if (image.isEmpty()) return

      const size = image.getSize()
      if (size.width === 0 || size.height === 0) return

      const hash = imageHash(image)

      if (hash !== lastClipboardImageHash) {
        lastClipboardImageHash = hash
        const buffer = image.toPNG()
        const timestamp = Date.now()
        const fileName = `screenshot_${timestamp}.png`
        const filePath = path.join(tempDir, fileName)

        fs.writeFileSync(filePath, buffer)
        const dataUrl = image.toDataURL()

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('screenshot-captured', {
            id: `ss_${timestamp}`,
            type: 'image',
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
  let busy = false
  const checkMedia = async () => {
    if (busy) return
    busy = true
    try {
      const data = await fetchMediaState()
      if (data) {
        const sig = JSON.stringify({
          hasMedia: data.hasMedia,
          title: data.title,
          artist: data.artist,
          status: data.status,
          duration: data.duration,
          position: Math.round(data.position || 0),
          hasArt: Boolean(data.albumArt),
        })
        if (sig !== lastMediaSignature) {
          lastMediaSignature = sig
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('media-state-changed', data)
          }
        }
      }
    } catch {
      // Ignore transient errors
    } finally {
      busy = false
    }
  }

  mediaPollInterval = setInterval(checkMedia, 1200)
}

function startBatteryWatcher() {
  let busy = false
  const checkBattery = async () => {
    if (busy) return
    busy = true
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
    } finally {
      busy = false
    }
  }

  batteryPollInterval = setInterval(checkBattery, 4000)
}

function startAppsWatcher() {
  let busy = false
  const checkApps = async () => {
    if (busy) return
    busy = true
    try {
      const output = await runPowerShellScript('manage-apps.ps1', ['-Mode', 'status'])
      if (output) {
        const data = JSON.parse(output)
        // Safe Exam Browser (SEB) Guard: immediately self-terminate if SEB starts!
        if (data && data.sebDetected) {
          globalShortcut.unregisterAll()
          if (tray) {
            tray.destroy()
            tray = null
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.destroy()
          }
          app.exit(0)
          return
        }
        if (data && data.waNotif && data.waNotif.hasNotif && data.waNotif.id) {
          if (!initializedWaNotif) {
            // Seed existing toast notification on boot so historical Action Center toasts don't replay
            initializedWaNotif = true
            lastWaNotifId = String(data.waNotif.id)
          } else if (String(data.waNotif.id) !== lastWaNotifId) {
            lastWaNotifId = String(data.waNotif.id)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('wa-notification', {
                id: String(data.waNotif.id),
                sender: data.waNotif.sender || 'WhatsApp Web',
                message: data.waNotif.message || 'Pesan baru masuk',
                source: data.waNotif.source || 'WhatsApp Web',
                timestamp: Date.now(),
              })
            }
          }
        } else {
          initializedWaNotif = true
          // If unread badge cleared (user read the message), reset so next (1) WhatsApp triggers again
          if (lastWaNotifId.startsWith('title_unread_')) {
            lastWaNotifId = ''
          }
        }

        if (output !== lastAppsSignature) {
          lastAppsSignature = output
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('apps-state-changed', data)
          }
        }
      }
    } catch {
      // Ignore transient errors
    } finally {
      busy = false
    }
  }

  appsPollInterval = setInterval(checkApps, 2000)
}

// IPC Handlers
ipcMain.handle('get-current-media', async () => {
  const data = await fetchMediaState(true)
  return data || { hasMedia: false }
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

ipcMain.handle('get-apps-status', async () => {
  try {
    const output = await runPowerShellScript('manage-apps.ps1', ['-Mode', 'status'])
    if (output) return JSON.parse(output)
  } catch (err) {
    console.error('get-apps-status error:', err)
  }
  return { apps: [], activeApp: '', activeTitle: '' }
})

ipcMain.handle('app-action', async (_event, payload: { target: string; command?: string }) => {
  try {
    const target = payload?.target || ''
    const command = payload?.command || 'open'
    const output = await runPowerShellScript('manage-apps.ps1', [
      '-Mode',
      'action',
      '-Target',
      target,
      '-Command',
      command,
    ])
    // Refresh app status & media state right after action
    setTimeout(async () => {
      try {
        const appsOut = await runPowerShellScript('manage-apps.ps1', ['-Mode', 'status'])
        if (appsOut && mainWindow && !mainWindow.isDestroyed()) {
          lastAppsSignature = appsOut
          mainWindow.webContents.send('apps-state-changed', JSON.parse(appsOut))
        }
        if (target === 'spotify') {
          const mediaData = await fetchMediaState(true)
          if (mediaData && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('media-state-changed', mediaData)
          }
        }
      } catch {}
    }, 600)
    return output ? JSON.parse(output) : { success: true }
  } catch (err) {
    console.error('app-action error:', err)
    return { success: false }
  }
})

ipcMain.handle('get-autostart', async () => {
  return getAutoStartEnabled()
})

ipcMain.handle('set-autostart', async (_event, enabled: boolean) => {
  const confirmed = setAutoStartEnabled(Boolean(enabled))
  updateTrayMenu()
  return confirmed
})

ipcMain.on('start-file-drag', (event, filePath: string) => {
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase()
    const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)
    const icon = isImg
      ? nativeImage.createFromPath(filePath).resize({ width: 64, height: 64 })
      : nativeImage.createEmpty()
    event.sender.startDrag({
      file: filePath,
      icon,
    })
  }
})

ipcMain.on('media-action', async (_event, action: string, value?: number) => {
  try {
    const args = value !== undefined ? [action, String(value)] : [action]
    await runPowerShellScript('control-media.ps1', args)
    setTimeout(async () => {
      const data = await fetchMediaState()
      if (data && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', data)
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
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
    return filePath
  }
  return null
})

ipcMain.handle('copy-image-to-clipboard', async (_event, dataUrl: string) => {
  try {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
    lastClipboardImageHash = imageHash(clipboard.readImage())
    return true
  } catch (err) {
    console.error('Error copying image:', err)
    return false
  }
})

ipcMain.handle('copy-text-to-clipboard', async (_event, text: string) => {
  try {
    lastClipboardText = (text || '').trim()
    clipboard.writeText(text || '')
    return true
  } catch (err) {
    console.error('Error copying text:', err)
    return false
  }
})

ipcMain.handle('open-external-url', async (_event, url: string) => {
  try {
    if (url && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
      return true
    }
  } catch {}
  return false
})

ipcMain.on('dismiss-screenshot', () => {
  // Optional cleanup
})

ipcMain.on('app-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('app-close', () => {
  app.quit()
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.dynasis.island')
  migrateAutoStartRegistry()
  setupSystemTray()
  createWindow()

  // Global hotkey: Alt + \ toggles show / hide Dynasis
  globalShortcut.register('Alt+\\', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (tray) {
    tray.destroy()
    tray = null
  }
})

app.on('window-all-closed', () => {
  if (cursorPollInterval) clearInterval(cursorPollInterval)
  if (clipboardPollInterval) clearInterval(clipboardPollInterval)
  if (mediaPollInterval) clearInterval(mediaPollInterval)
  if (batteryPollInterval) clearInterval(batteryPollInterval)
  if (appsPollInterval) clearInterval(appsPollInterval)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
