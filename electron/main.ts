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
  session,
} from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import zlib from 'zlib'
import { execFile, execFileSync, spawn, type ChildProcessByStdio } from 'child_process'
import { createInterface } from 'readline'
import type { Readable } from 'stream'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type HostProcess = ChildProcessByStdio<null, Readable, Readable>

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
  // Exit immediately instead of app.quit(): quitting would still run
  // will-quit and could delete the primary instance's screenshot temp files.
  app.exit(0)
}

let mainWindow: BrowserWindow | null = null
let waWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuittingApp = false
let pendingSecondInstance = false

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    // Second launch raced the first instance's startup; replay after the
    // window has loaded (see did-finish-load below).
    pendingSecondInstance = true
    return
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  app.focus({ steal: true })
  mainWindow.focus()

  const sendOpen = () => {
    if (isQuittingApp || !mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('tray-command', 'open')
  }

  sendOpen()
  // On a cold start the renderer may still be mounting its IPC listener;
  // replay once after React has attached.
  setTimeout(sendOpen, 400)
}

if (gotTheLock) {
  app.on('second-instance', () => {
    focusMainWindow()
  })
}

let lastClipboardImageHash = ''
let lastClipboardText = ''
let clipboardPollInterval: NodeJS.Timeout | null = null
let cursorPollInterval: NodeJS.Timeout | null = null

let lastAppsSignature = ''
let lastWaToastId = ''
let lastWaTabUnread = 0
let lastWaBridgeUnread = 0
let lastWaNotifFiredAt = 0
let initializedWaNotif = false

// Persistent PowerShell hosts (one long-lived process each, JSON lines on stdout)
let mediaHost: HostProcess | null = null
let appsHost: HostProcess | null = null
let mediaHostRestartTimer: NodeJS.Timeout | null = null
let appsHostRestartTimer: NodeJS.Timeout | null = null
let lastMediaState: any = null
let lastAppsSnapshot: any = null

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
const previewMaxDimension = 480

// The shelf lives only in renderer memory, so any screenshot left in the temp
// dir belongs to a previous run. Wipe it on boot instead of leaking gigabytes.
function clearTempScreenshotDir() {
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
      return
    }
    for (const entry of fs.readdirSync(tempDir)) {
      const entryPath = path.join(tempDir, entry)
      try {
        const stat = fs.lstatSync(entryPath)
        if (stat.isDirectory()) {
          fs.rmSync(entryPath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(entryPath)
        }
      } catch {
        // File may be locked by another process; skip it.
      }
    }
  } catch (err) {
    console.error('Failed to reset screenshot temp dir:', err)
  }
}

function isInsideTempDir(filePath: string): boolean {
  try {
    const resolved = path.resolve(filePath)
    const root = path.resolve(tempDir) + path.sep
    return resolved.toLowerCase().startsWith(root.toLowerCase())
  } catch {
    return false
  }
}

// Only ever delete files that we created ourselves, never user files.
function removeTempFile(filePath?: string | null) {
  if (!filePath || !isInsideTempDir(filePath)) return
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Already deleted.
  }
}

// Safety net: if the renderer never acknowledges a capture (crash, reload),
// keep at most a few dozen screenshots instead of growing without bound.
function pruneTempScreenshots(maxFiles = 40) {
  try {
    const files = fs
      .readdirSync(tempDir)
      .filter((name) => /^screenshot_\d+\.png$/.test(name))
      .sort()
    for (const name of files.slice(0, Math.max(0, files.length - maxFiles))) {
      removeTempFile(path.join(tempDir, name))
    }
  } catch {
    // Ignore.
  }
}

// Never let a rejected second instance touch the running instance's files.
if (gotTheLock) {
  clearTempScreenshotDir()
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

function parseJsonLine(line: string): any | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function scheduleHostRestart(kind: 'media' | 'apps') {
  if (isQuittingApp) return
  if (kind === 'media') {
    if (mediaHostRestartTimer) return
    mediaHostRestartTimer = setTimeout(() => {
      mediaHostRestartTimer = null
      startMediaHost()
    }, 2000)
  } else {
    if (appsHostRestartTimer) return
    appsHostRestartTimer = setTimeout(() => {
      appsHostRestartTimer = null
      startAppsHost()
    }, 2000)
  }
}

function startMediaHost() {
  if (mediaHost || isQuittingApp) return

  let child: HostProcess
  try {
    child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        getScriptPath('media-host.ps1'),
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch (err) {
    console.error('Failed to start media host:', err)
    scheduleHostRestart('media')
    return
  }

  mediaHost = child
  createInterface({ input: child.stdout }).on('line', (line) => {
    const data = parseJsonLine(line)
    if (!data) return
    if (data.hasMedia) {
      // Album art is only transmitted when the track changes; reuse the last copy.
      if (!data.albumArt && lastMediaState?.albumArt) {
        data.albumArt = lastMediaState.albumArt
      }
      lastMediaState = data
    } else {
      lastMediaState = { ...(lastMediaState || {}), hasMedia: false, albumArt: undefined }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media-state-changed', data)
    }
  })

  child.stderr.on('data', (buf) => {
    const text = String(buf).trim()
    if (text) console.error('[media-host]', text)
  })
  child.on('error', (err) => console.error('[media-host] error:', err))
  child.on('exit', (code) => {
    mediaHost = null
    if (!isQuittingApp) {
      console.error(`[media-host] exited (code ${code}); restarting in 2s`)
      scheduleHostRestart('media')
    }
  })
}

function handleAppsPayload(data: any) {
  if (!data) return

  // Safe Exam Browser (SEB) Guard: immediately self-terminate if SEB starts!
  if (data.sebDetected) {
    isQuittingApp = true
    stopHosts()
    globalShortcut.unregisterAll()
    if (tray) {
      tray.destroy()
      tray = null
    }
    if (waWindow && !waWindow.isDestroyed()) {
      waWindow.destroy()
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy()
    }
    app.exit(0)
    return
  }

  const currentTabUnread = typeof data?.waTabUnread === 'number' ? data.waTabUnread : 0
  const toastNotif =
    data?.waNotif?.hasNotif && String(data.waNotif.id).startsWith('toast_')
      ? data.waNotif
      : null

  if (!initializedWaNotif) {
    // Seed existing toast & unread count on boot so historical notifications don't replay
    initializedWaNotif = true
    lastWaToastId = toastNotif ? String(toastNotif.id) : ''
    lastWaTabUnread = currentTabUnread
  } else {
    if (toastNotif && String(toastNotif.id) !== lastWaToastId) {
      lastWaToastId = String(toastNotif.id)
      dispatchWhatsAppNotification({
        id: String(toastNotif.id),
        sender: toastNotif.sender || 'WhatsApp Web',
        message: toastNotif.message || 'Pesan baru masuk',
        source: toastNotif.source || 'WhatsApp Web',
      })
    }
    if (currentTabUnread > lastWaTabUnread) {
      lastWaTabUnread = currentTabUnread
      dispatchWhatsAppNotification({
        id: `tab_unread_${Date.now()}_${currentTabUnread}`,
        sender: 'WhatsApp Web',
        message: `${currentTabUnread} pesan baru belum dibaca di WhatsApp Web`,
        source: 'WhatsApp Web',
      })
    } else if (currentTabUnread < lastWaTabUnread) {
      lastWaTabUnread = currentTabUnread
    }
  }

  data.waBridgeActive = Boolean(waWindow && !waWindow.isDestroyed())
  lastAppsSnapshot = data
  const nextSig = JSON.stringify(data)
  if (nextSig !== lastAppsSignature) {
    lastAppsSignature = nextSig
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('apps-state-changed', data)
    }
  }
}

function startAppsHost() {
  if (appsHost || isQuittingApp) return

  let child: HostProcess
  try {
    child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        getScriptPath('apps-host.ps1'),
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch (err) {
    console.error('Failed to start apps host:', err)
    scheduleHostRestart('apps')
    return
  }

  appsHost = child
  createInterface({ input: child.stdout }).on('line', (line) => {
    handleAppsPayload(parseJsonLine(line))
  })

  child.stderr.on('data', (buf) => {
    const text = String(buf).trim()
    if (text) console.error('[apps-host]', text)
  })
  child.on('error', (err) => console.error('[apps-host] error:', err))
  child.on('exit', (code) => {
    appsHost = null
    if (!isQuittingApp) {
      console.error(`[apps-host] exited (code ${code}); restarting in 2s`)
      scheduleHostRestart('apps')
    }
  })
}

function stopHosts() {
  if (mediaHostRestartTimer) {
    clearTimeout(mediaHostRestartTimer)
    mediaHostRestartTimer = null
  }
  if (appsHostRestartTimer) {
    clearTimeout(appsHostRestartTimer)
    appsHostRestartTimer = null
  }
  for (const host of [mediaHost, appsHost]) {
    if (host && !host.killed) {
      try {
        host.kill()
      } catch {
        // Already gone
      }
    }
  }
  mediaHost = null
  appsHost = null
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

function createBmpIcoBuffer(): Buffer {
  const w = 48
  const h = 48
  const maskRowBytes = Math.ceil(w / 32) * 4
  const xorBytes = w * h * 4
  const andBytes = maskRowBytes * h

  const bih = Buffer.alloc(40)
  bih.writeUInt32LE(40, 0)
  bih.writeInt32LE(w, 4)
  bih.writeInt32LE(h * 2, 8)
  bih.writeUInt16LE(1, 12)
  bih.writeUInt16LE(32, 14)
  bih.writeUInt32LE(0, 16)
  bih.writeUInt32LE(xorBytes + andBytes, 20)

  const xor = Buffer.alloc(xorBytes)
  for (let y = 0; y < h; y++) {
    const bmpRow = h - 1 - y
    for (let x = 0; x < w; x++) {
      const idx = (bmpRow * w + x) * 4
      const dx = Math.abs(x - 23.5)
      const dy = Math.abs(y - 23.5)
      const dist = Math.hypot(Math.max(0, dx - 9.5), Math.max(0, dy - 9.5))
      if (dist <= 13) {
        const dotDist = Math.hypot(x - 23.5, y - 23.5)
        if (dotDist <= 8) {
          // BGRA Emerald (#10b981 -> R=16, G=185, B=129)
          xor[idx] = 129
          xor[idx + 1] = 185
          xor[idx + 2] = 16
          xor[idx + 3] = 255
        } else {
          // BGRA Obsidian (#121418 -> R=18, G=20, B=24)
          xor[idx] = 24
          xor[idx + 1] = 20
          xor[idx + 2] = 18
          xor[idx + 3] = 255
        }
      }
    }
  }

  const andMask = Buffer.alloc(andBytes, 0)
  const dib = Buffer.concat([bih, xor, andMask])
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type: 1 = ICO
  header.writeUInt16LE(1, 4) // Image count: 1
  header[6] = w
  header[7] = h
  header[8] = 0
  header[9] = 0
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(dib.length, 14)
  header.writeUInt32LE(22, 18)

  return Buffer.concat([header, dib])
}

function ensureDynasisIcoFile(): string {
  const exeDir = path.dirname(process.execPath)
  const primaryIco = path.join(exeDir, 'dynasis.ico')
  const fallbackIco = path.join(tempDir, 'dynasis.ico')
  const icoBuf = createBmpIcoBuffer()

  try {
    fs.writeFileSync(primaryIco, icoBuf)
    return primaryIco
  } catch {
    try {
      fs.writeFileSync(fallbackIco, icoBuf)
    } catch {}
    return fallbackIco
  }
}

function ensureDynasisStartupLauncher(icoPath: string): string {
  const exeDir = path.dirname(process.execPath)
  const exeName = path.basename(process.execPath)
  const launcherExe = path.join(exeDir, 'Dynasis-Startup.exe')
  const oldCmd = path.join(exeDir, 'Dynasis-Start.cmd')
  try {
    if (fs.existsSync(oldCmd)) fs.unlinkSync(oldCmd)
  } catch {}

  if (fs.existsSync(launcherExe)) {
    return launcherExe
  }

  const csPath = path.join(tempDir, 'DynasisStartupLauncher.cs')
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
  try {
    const csSource = `using System;
using System.IO;
using System.Diagnostics;
using System.Reflection;

[assembly: AssemblyTitle("Dynasis")]
[assembly: AssemblyDescription("Dynasis â€” Dynamic System Island")]
[assembly: AssemblyCompany("arazzki")]
[assembly: AssemblyProduct("Dynasis")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

class DynasisStartup {
    static void Main() {
        try {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string target = Path.Combine(dir, "${exeName.replace(/\\/g, '\\\\')}");
            if (File.Exists(target)) {
                ProcessStartInfo psi = new ProcessStartInfo(target);
                psi.WorkingDirectory = dir;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
        } catch {}
    }
}
`
    fs.writeFileSync(csPath, csSource, 'utf8')
    execFileSync(
      cscPath,
      [
        '/nologo',
        '/target:winexe',
        `/win32icon:${icoPath}`,
        `/out:${launcherExe}`,
        csPath,
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    if (fs.existsSync(launcherExe)) {
      return launcherExe
    }
  } catch (err) {
    console.error('Failed to compile Dynasis-Startup.exe:', err)
  }
  return process.execPath
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
        'arazzki',
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
      const launcherPath = ensureDynasisStartupLauncher(icoPath)
      shell.writeShortcutLink(lnkPath, 'create', {
        target: launcherPath,
        cwd: path.dirname(process.execPath),
        description: 'Dynasis â€” Dynamic System Island',
        icon: launcherPath,
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
      label: 'Dynasis â€” Dynamic System Island',
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
      label: 'Sinkron WhatsApp Web (Background Bridge)',
      click: () => {
        openOrFocusWhatsAppWebBridge(true)
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
        isQuittingApp = true
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
    tray.setToolTip('Dynasis â€” Dynamic System Island (Alt+\\)')
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

  // When webContents is ready, replay the latest host snapshots (if any)
  mainWindow.webContents.on('did-finish-load', () => {
    if (lastMediaState && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('media-state-changed', lastMediaState)
    }
    if (lastAppsSnapshot && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('apps-state-changed', lastAppsSnapshot)
    }
    if (pendingSecondInstance) {
      pendingSecondInstance = false
      setTimeout(focusMainWindow, 300)
    }
  })

  // Start background services
  startCursorPoll()
  startClipboardWatcher()
  startMediaHost()
  startAppsHost()
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

        // Only ship a small preview to the renderer. Full-resolution pixels
        // stay on disk and are read back for copy/save/drag.
        const scale = Math.min(
          1,
          previewMaxDimension / Math.max(size.width, size.height)
        )
        const preview =
          scale < 1
            ? image.resize({
                width: Math.max(1, Math.round(size.width * scale)),
                height: Math.max(1, Math.round(size.height * scale)),
                quality: 'good',
              })
            : image
        const dataUrl = preview.toDataURL()

        pruneTempScreenshots()

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

function dispatchWhatsAppNotification(payload: {
  id: string
  sender: string
  message: string
  source?: string
}) {
  const now = Date.now()
  if (now - lastWaNotifFiredAt < 1800) return
  lastWaNotifFiredAt = now
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('wa-notification', {
      id: payload.id || `wa_${now}`,
      sender: payload.sender || 'WhatsApp Web',
      message: payload.message || 'Pesan baru masuk',
      source: payload.source || 'WhatsApp Web',
      timestamp: now,
    })
  }
}

function getWaBridgeConfigPath(): string {
  return path.join(app.getPath('userData'), 'wa-bridge-config.json')
}

function setWaBridgeEnabledPref(enabled: boolean) {
  try {
    fs.writeFileSync(getWaBridgeConfigPath(), JSON.stringify({ enabled }), 'utf-8')
  } catch {}
}

function isWaBridgeEnabledPref(): boolean {
  try {
    const p = getWaBridgeConfigPath()
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
      return Boolean(parsed?.enabled)
    }
  } catch {}
  return false
}

function openOrFocusWhatsAppWebBridge(showWindow = true) {
  if (showWindow) {
    setWaBridgeEnabledPref(true)
  }

  if (waWindow && !waWindow.isDestroyed()) {
    if (showWindow) {
      waWindow.show()
      if (waWindow.isMinimized()) waWindow.restore()
      waWindow.focus()
    }
    return waWindow
  }

  const CHROME_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  const waSession = session.fromPartition('persist:whatsapp')
  waSession.setUserAgent(CHROME_UA)
  waSession.setPermissionCheckHandler(() => true)
  waSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })

  waWindow = new BrowserWindow({
    title: 'Dynasis â€” WhatsApp Web Sync (Tutup [X] agar tetap sinkron di latar belakang)',
    icon: createTrayIcon(),
    width: 1020,
    height: 700,
    show: showWindow,
    autoHideMenuBar: true,
    backgroundColor: '#111b21',
    webPreferences: {
      partition: 'persist:whatsapp',
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  waWindow.webContents.setUserAgent(CHROME_UA)

  const injectWaHooks = () => {
    if (!waWindow || waWindow.isDestroyed()) return
    waWindow.webContents
      .executeJavaScript(
        `(() => {
          if (window.__dynasisWaHooked) return;
          window.__dynasisWaHooked = true;

          const emitWa = (sender, message) => {
            try {
              const s = String(sender || 'WhatsApp Web').trim();
              const m = String(message || 'Pesan baru masuk').trim();
              if (!s && !m) return;
              console.info('__DYNASIS_WA__:' + JSON.stringify({
                id: 'wabridge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                sender: s,
                message: m,
                source: 'WhatsApp Web'
              }));
            } catch (e) {}
          };

          const OrigNotif = window.Notification;
          function DynasisNotification(title, options) {
            emitWa(title, options && options.body);
            this.title = title;
            this.body = (options && options.body) || '';
            this.close = () => {};
            this.addEventListener = () => {};
            this.removeEventListener = () => {};
          }
          DynasisNotification.permission = 'granted';
          DynasisNotification.requestPermission = async () => 'granted';
          try {
            Object.defineProperty(window, 'Notification', {
              value: DynasisNotification,
              configurable: true,
              writable: true
            });
          } catch (e) {
            window.Notification = DynasisNotification;
          }

          if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype) {
            const origShow = ServiceWorkerRegistration.prototype.showNotification;
            ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
              emitWa(title, options && options.body);
              return origShow ? origShow.apply(this, arguments) : Promise.resolve();
            };
          }
        })();`
      )
      .catch(() => {})
  }

  waWindow.webContents.on('dom-ready', injectWaHooks)
  waWindow.webContents.on('did-finish-load', injectWaHooks)

  waWindow.webContents.on('console-message', (_event, _level, message) => {
    if (typeof message === 'string' && message.startsWith('__DYNASIS_WA__:')) {
      try {
        const raw = message.slice('__DYNASIS_WA__:'.length)
        const parsed = JSON.parse(raw)
        if (parsed && (parsed.sender || parsed.message)) {
          dispatchWhatsAppNotification(parsed)
        }
      } catch {}
    }
  })

  waWindow.on('page-title-updated', (_event, title) => {
    const m = title.match(/\((\d+)\)\s*WhatsApp/i)
    const count = m ? parseInt(m[1], 10) : 0
    if (count > lastWaBridgeUnread) {
      lastWaBridgeUnread = count
      setTimeout(async () => {
        if (Date.now() - lastWaNotifFiredAt < 1800) return
        let sender = 'WhatsApp Web'
        let msg = `${count} pesan baru belum dibaca di WhatsApp Web`
        try {
          if (waWindow && !waWindow.isDestroyed()) {
            const scraped = await waWindow.webContents.executeJavaScript(`(() => {
              try {
                const badge = document.querySelector('#pane-side span[aria-label*="unread"], #pane-side span[aria-label*="belum dibaca"]');
                const row = badge ? badge.closest('[role="listitem"], [role="row"]') : null;
                if (row) {
                  const titleEl = row.querySelector('span[dir="auto"][title]');
                  const spans = Array.from(row.querySelectorAll('span[dir="ltr"], span[dir="auto"]'))
                    .map(el => (el.textContent || '').trim())
                    .filter(t => t.length > 1 && (!titleEl || t !== titleEl.getAttribute('title')));
                  return {
                    sender: titleEl ? titleEl.getAttribute('title') : 'WhatsApp Web',
                    message: spans.length > 0 ? spans[spans.length - 1] : '${count} pesan baru belum dibaca'
                  };
                }
              } catch (e) {}
              return null;
            })()`)
            if (scraped && scraped.sender) {
              sender = scraped.sender
              msg = scraped.message || msg
            }
          }
        } catch {}
        dispatchWhatsAppNotification({
          id: `wabridge_title_${Date.now()}_${count}`,
          sender,
          message: msg,
          source: 'WhatsApp Web',
        })
      }, 350)
    } else if (count < lastWaBridgeUnread) {
      lastWaBridgeUnread = count
    }
  })

  waWindow.on('close', (e) => {
    if (!isQuittingApp && waWindow && !waWindow.isDestroyed()) {
      e.preventDefault()
      waWindow.hide()
    }
  })

  waWindow.on('closed', () => {
    waWindow = null
  })

  waWindow.loadURL('https://web.whatsapp.com')
  return waWindow
}

// IPC Handlers
ipcMain.handle('get-current-media', async () => {
  return lastMediaState || { hasMedia: false }
})

ipcMain.handle('get-apps-status', async () => {
  if (lastAppsSnapshot) {
    return {
      ...lastAppsSnapshot,
      waBridgeActive: Boolean(waWindow && !waWindow.isDestroyed()),
    }
  }
  try {
    const output = await runPowerShellScript('manage-apps.ps1', ['-Mode', 'status'])
    if (output) {
      const parsed = JSON.parse(output)
      parsed.waBridgeActive = Boolean(waWindow && !waWindow.isDestroyed())
      return parsed
    }
  } catch (err) {
    console.error('get-apps-status error:', err)
  }
  return {
    apps: [],
    activeApp: '',
    activeTitle: '',
    waBridgeActive: Boolean(waWindow && !waWindow.isDestroyed()),
  }
})

ipcMain.handle('app-action', async (_event, payload: { target: string; command?: string }) => {
  try {
    const target = (payload?.target || '').toLowerCase()
    const command = (payload?.command || 'open').toLowerCase()

    if (target === 'whatsapp') {
      if (command === 'bridge') {
        openOrFocusWhatsAppWebBridge(true)
        return { success: true, action: 'opened_wa_bridge' }
      }
      if (waWindow && !waWindow.isDestroyed()) {
        openOrFocusWhatsAppWebBridge(true)
        return { success: true, action: 'focused_wa_bridge' }
      }
    }

    const output = await runPowerShellScript('manage-apps.ps1', [
      '-Mode',
      'action',
      '-Target',
      target,
      '-Command',
      command,
    ])
    // Persisted hosts pick up the change on their next tick (media ~0.7s, apps ~2s)
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
    // media-host.ps1 emits the refreshed state on its next tick (~0.7s)
  } catch (err) {
    console.error('Media action error:', err)
  }
})

type ImagePayload = { filePath?: string; dataUrl?: string } | string

function readImagePayload(payload?: ImagePayload | null): Buffer | null {
  if (!payload) return null

  if (typeof payload === 'object' && payload.filePath) {
    if (!fs.existsSync(payload.filePath)) return null
    try {
      return fs.readFileSync(payload.filePath)
    } catch {
      return null
    }
  }

  const dataUrl = typeof payload === 'string' ? payload : payload.dataUrl
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return null
  return Buffer.from(dataUrl.slice(comma + 1), 'base64')
}

function resolveImage(payload?: ImagePayload | null): Electron.NativeImage | null {
  if (!payload) return null

  if (typeof payload === 'object' && payload.filePath && fs.existsSync(payload.filePath)) {
    const fromPath = nativeImage.createFromPath(payload.filePath)
    if (!fromPath.isEmpty()) return fromPath
  }

  const dataUrl = typeof payload === 'string' ? payload : payload.dataUrl
  if (!dataUrl) return null
  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    return image.isEmpty() ? null : image
  } catch {
    return null
  }
}

ipcMain.handle('save-screenshot', async (_event, payload: ImagePayload) => {
  if (!mainWindow) return null

  const buffer = readImagePayload(payload)
  if (!buffer) return null

  const sourceFilePath = typeof payload === 'object' ? payload.filePath : undefined
  const sourceExt = sourceFilePath ? path.extname(sourceFilePath).toLowerCase() : '.png'
  const ext = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(sourceExt)
    ? sourceExt
    : '.png'
  const extName = ext.replace('.', '')

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Screenshot',
    defaultPath: `Dynasis_Screenshot_${Date.now()}${ext}`,
    filters: [{ name: ext === '.png' ? 'PNG Image' : `${extName.toUpperCase()} Image`, extensions: [extName] }],
  })

  if (filePath) {
    fs.writeFileSync(filePath, buffer)
    return filePath
  }
  return null
})

ipcMain.handle('copy-image-to-clipboard', async (_event, payload: ImagePayload) => {
  try {
    const image = resolveImage(payload)
    if (!image) return false
    clipboard.writeImage(image)
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

ipcMain.on('dismiss-screenshot', (_event, filePath?: string | null) => {
  // Legacy payloads were item ids (no path), those are harmless no-ops.
  removeTempFile(filePath)
})

ipcMain.on('app-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('app-close', () => {
  isQuittingApp = true
  app.quit()
})

app.whenReady().then(() => {
  if (!gotTheLock) return
  app.setAppUserModelId('com.dynasis.island')
  migrateAutoStartRegistry()
  setupSystemTray()
  createWindow()
  if (isWaBridgeEnabledPref()) {
    setTimeout(() => {
      openOrFocusWhatsAppWebBridge(false)
    }, 2500)
  }

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
  isQuittingApp = true
  stopHosts()
  clearTempScreenshotDir()
  globalShortcut.unregisterAll()
  if (tray) {
    tray.destroy()
    tray = null
  }
})

app.on('window-all-closed', () => {
  if (cursorPollInterval) clearInterval(cursorPollInterval)
  if (clipboardPollInterval) clearInterval(clipboardPollInterval)
  stopHosts()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

