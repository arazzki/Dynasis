import { contextBridge, ipcRenderer } from 'electron'

export interface CursorPayload {
  x: number
  y: number
  onIsland: boolean
  onWakeStrip: boolean
}

export interface DynasisAPI {
  setIslandSize: (width: number, height: number) => void
  setIslandRect: (x: number, y: number, w: number, h: number) => void
  moveWindowBy: (deltaX: number, deltaY: number) => void
  resetWindowPosition: () => void
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void
  onCursorMoved: (callback: (cursor: CursorPayload) => void) => () => void
  onTrayCommand: (callback: (command: 'open' | 'compact' | 'stealth' | 'settings') => void) => () => void
  onScreenshotCaptured: (callback: (data: { id: string; type?: 'image' | 'text' | 'file'; filePath?: string; dataUrl: string; text?: string; name?: string; timestamp: number; size?: { width: number; height: number } }) => void) => () => void
  onClipboardTextCaptured: (callback: (data: { id: string; type: 'text'; text: string; name: string; dataUrl: string; timestamp: number }) => void) => () => void
  onMediaStateChanged: (callback: (media: any) => void) => () => void
  onBatteryStateChanged: (callback: (battery: any) => void) => () => void
  onAppsStateChanged: (callback: (data: any) => void) => () => void
  startFileDrag: (filePath: string) => void
  saveScreenshot: (dataUrl: string) => Promise<string | null>
  copyImageToClipboard: (dataUrl: string) => Promise<boolean>
  copyTextToClipboard: (text: string) => Promise<boolean>
  openExternalUrl: (url: string) => Promise<boolean>
  dismissScreenshot: (id: string) => void
  mediaAction: (action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek', value?: number) => void
  getCurrentMedia: () => Promise<any>
  getCurrentBattery: () => Promise<any>
  getAppsStatus: () => Promise<any>
  appAction: (target: string, command?: string) => Promise<any>
  getAutoStart: () => Promise<boolean>
  setAutoStart: (enabled: boolean) => Promise<boolean>
  minimizeApp: () => void
  closeApp: () => void
}

const api: DynasisAPI = {
  setIslandSize: (width, height) => ipcRenderer.send('set-island-size', { width, height }),
  setIslandRect: (x, y, w, h) => ipcRenderer.send('set-island-rect', { x, y, w, h }),
  moveWindowBy: (deltaX, deltaY) => ipcRenderer.send('move-window-by', { deltaX, deltaY }),
  resetWindowPosition: () => ipcRenderer.send('reset-window-position'),
  setIgnoreMouseEvents: (ignore, options = { forward: true }) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  onCursorMoved: (callback) => {
    const handler = (_: any, data: CursorPayload) => callback(data)
    ipcRenderer.on('cursor-moved', handler)
    return () => ipcRenderer.removeListener('cursor-moved', handler)
  },
  onTrayCommand: (callback) => {
    const handler = (_: any, cmd: any) => callback(cmd)
    ipcRenderer.on('tray-command', handler)
    return () => ipcRenderer.removeListener('tray-command', handler)
  },
  onScreenshotCaptured: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('screenshot-captured', handler)
    return () => ipcRenderer.removeListener('screenshot-captured', handler)
  },
  onClipboardTextCaptured: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('clipboard-text-captured', handler)
    return () => ipcRenderer.removeListener('clipboard-text-captured', handler)
  },
  onMediaStateChanged: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('media-state-changed', handler)
    return () => ipcRenderer.removeListener('media-state-changed', handler)
  },
  onBatteryStateChanged: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('battery-state-changed', handler)
    return () => ipcRenderer.removeListener('battery-state-changed', handler)
  },
  onAppsStateChanged: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('apps-state-changed', handler)
    return () => ipcRenderer.removeListener('apps-state-changed', handler)
  },
  getCurrentMedia: () => ipcRenderer.invoke('get-current-media'),
  getCurrentBattery: () => ipcRenderer.invoke('get-current-battery'),
  getAppsStatus: () => ipcRenderer.invoke('get-apps-status'),
  appAction: (target: string, command = 'open') => ipcRenderer.invoke('app-action', { target, command }),
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-autostart', enabled),
  startFileDrag: (filePath: string) => ipcRenderer.send('start-file-drag', filePath),
  saveScreenshot: (dataUrl: string) => ipcRenderer.invoke('save-screenshot', dataUrl),
  copyImageToClipboard: (dataUrl: string) => ipcRenderer.invoke('copy-image-to-clipboard', dataUrl),
  copyTextToClipboard: (text: string) => ipcRenderer.invoke('copy-text-to-clipboard', text),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  dismissScreenshot: (id: string) => ipcRenderer.send('dismiss-screenshot', id),
  mediaAction: (action, value) => ipcRenderer.send('media-action', action, value),
  minimizeApp: () => ipcRenderer.send('app-minimize'),
  closeApp: () => ipcRenderer.send('app-close'),
}

contextBridge.exposeInMainWorld('dynasis', api)
