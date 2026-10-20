import { contextBridge, ipcRenderer } from 'electron'

export interface DynasisAPI {
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void
  onScreenshotCaptured: (callback: (data: { id: string; filePath?: string; dataUrl: string; timestamp: number; size?: { width: number; height: number } }) => void) => () => void
  onMediaStateChanged: (callback: (media: any) => void) => () => void
  onBatteryStateChanged: (callback: (battery: any) => void) => () => void
  startFileDrag: (filePath: string) => void
  saveScreenshot: (dataUrl: string) => Promise<string | null>
  copyImageToClipboard: (dataUrl: string) => Promise<boolean>
  dismissScreenshot: (id: string) => void
  mediaAction: (action: 'play' | 'pause' | 'next' | 'previous') => void
  minimizeApp: () => void
  closeApp: () => void
}

const api: DynasisAPI = {
  setIgnoreMouseEvents: (ignore, options = { forward: true }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },
  onScreenshotCaptured: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('screenshot-captured', handler)
    return () => {
      ipcRenderer.removeListener('screenshot-captured', handler)
    }
  },
  onMediaStateChanged: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('media-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('media-state-changed', handler)
    }
  },
  onBatteryStateChanged: (callback) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('battery-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('battery-state-changed', handler)
    }
  },
  startFileDrag: (filePath: string) => {
    ipcRenderer.send('start-file-drag', filePath)
  },
  saveScreenshot: (dataUrl: string) => {
    return ipcRenderer.invoke('save-screenshot', dataUrl)
  },
  copyImageToClipboard: (dataUrl: string) => {
    return ipcRenderer.invoke('copy-image-to-clipboard', dataUrl)
  },
  dismissScreenshot: (id: string) => {
    ipcRenderer.send('dismiss-screenshot', id)
  },
  mediaAction: (action) => {
    ipcRenderer.send('media-action', action)
  },
  minimizeApp: () => {
    ipcRenderer.send('app-minimize')
  },
  closeApp: () => {
    ipcRenderer.send('app-close')
  }
}

contextBridge.exposeInMainWorld('dynasis', api)
