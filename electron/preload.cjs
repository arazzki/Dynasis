const { contextBridge, ipcRenderer } = require('electron')

const api = {
  setIslandSize: (width, height) => {
    ipcRenderer.send('set-island-size', { width, height })
  },
  setIslandRect: (x, y, w, h) => {
    ipcRenderer.send('set-island-rect', { x, y, w, h })
  },
  moveWindowBy: (deltaX, deltaY) => {
    ipcRenderer.send('move-window-by', { deltaX, deltaY })
  },
  resetWindowPosition: () => {
    ipcRenderer.send('reset-window-position')
  },
  setIgnoreMouseEvents: (ignore, options = { forward: true }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },
  onCursorMoved: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('cursor-moved', handler)
    return () => {
      ipcRenderer.removeListener('cursor-moved', handler)
    }
  },
  onTrayCommand: (callback) => {
    const handler = (_, command) => callback(command)
    ipcRenderer.on('tray-command', handler)
    return () => {
      ipcRenderer.removeListener('tray-command', handler)
    }
  },
  onScreenshotCaptured: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('screenshot-captured', handler)
    return () => {
      ipcRenderer.removeListener('screenshot-captured', handler)
    }
  },
  onMediaStateChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('media-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('media-state-changed', handler)
    }
  },
  onBatteryStateChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('battery-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('battery-state-changed', handler)
    }
  },
  onAppsStateChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('apps-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('apps-state-changed', handler)
    }
  },
  onWhatsAppNotification: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('wa-notification', handler)
    return () => {
      ipcRenderer.removeListener('wa-notification', handler)
    }
  },
  getCurrentMedia: () => {
    return ipcRenderer.invoke('get-current-media')
  },
  getCurrentBattery: () => {
    return ipcRenderer.invoke('get-current-battery')
  },
  getAppsStatus: () => {
    return ipcRenderer.invoke('get-apps-status')
  },
  appAction: (target, command = 'open') => {
    return ipcRenderer.invoke('app-action', { target, command })
  },
  getAutoStart: () => {
    return ipcRenderer.invoke('get-autostart')
  },
  setAutoStart: (enabled) => {
    return ipcRenderer.invoke('set-autostart', enabled)
  },
  startFileDrag: (filePath) => {
    ipcRenderer.send('start-file-drag', filePath)
  },
  saveScreenshot: (dataUrl) => {
    return ipcRenderer.invoke('save-screenshot', dataUrl)
  },
  copyImageToClipboard: (dataUrl) => {
    return ipcRenderer.invoke('copy-image-to-clipboard', dataUrl)
  },
  dismissScreenshot: (id) => {
    ipcRenderer.send('dismiss-screenshot', id)
  },
  mediaAction: (action, value) => {
    ipcRenderer.send('media-action', action, value)
  },
  minimizeApp: () => {
    ipcRenderer.send('app-minimize')
  },
  closeApp: () => {
    ipcRenderer.send('app-close')
  },
}

contextBridge.exposeInMainWorld('dynasis', api)
