import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Home,
  Music,
  FolderPlus,
  Settings,
  Pin,
  EyeOff,
  ChevronUp,
  Zap,
  Move,
  RotateCcw,
  Power,
  Camera,
  Play,
  Pause,
  SkipForward,
  AppWindow,
  MessageSquare,
  Globe,
  Code2,
  VolumeX,
  MicOff,
  ExternalLink,
} from 'lucide-react'
import { Island, IslandState, NotchStyle } from './components/Island'
import { MediaIsland, MediaState } from './components/MediaIsland'
import { ShelfIsland, ScreenshotItem } from './components/ShelfIsland'
import { BatteryHUD, BatteryState } from './components/BatteryHUD'

export type ExpandedView = 'overview' | 'apps' | 'media' | 'shelf' | 'settings'

export interface SyncedAppItem {
  id: string
  name: string
  isRunning: boolean
  windowTitle: string
}

export interface WhatsAppNotif {
  id: string
  sender: string
  message: string
  source: string
  timestamp: number
}

interface DynasisPreferences {
  openOnHover: boolean
  autoHideToEdge: boolean
  autoCloseSeconds: number // 0 = never (pinned)
  notchStyle: NotchStyle
  showClock: boolean
}

const DEFAULT_PREFS: DynasisPreferences = {
  openOnHover: false,
  autoHideToEdge: true,
  autoCloseSeconds: 15,
  notchStyle: 'notch',
  showClock: true,
}

const PREFS_STORAGE_KEY = 'dynasis_prefs_v3'

function loadPrefs(): DynasisPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS
}

export default function App() {
  // Baseline state is 'hidden' (Stealth Edge 5px micro-bar) when cursor is outside Dynasis domain
  const [islandState, setIslandState] = useState<IslandState>('hidden')
  const [view, setView] = useState<ExpandedView>('overview')
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [prefs, setPrefs] = useState<DynasisPreferences>(loadPrefs)
  const [autoStart, setAutoStart] = useState(false)

  const [shelfItems, setShelfItems] = useState<ScreenshotItem[]>([])
  const [activeWaNotif, setActiveWaNotif] = useState<WhatsAppNotif | null>(null)
  const [waConnected, setWaConnected] = useState(false)
  const [battery, setBattery] = useState<BatteryState>({ level: 100, isCharging: false })
  const [media, setMedia] = useState<MediaState>({
    title: 'No media playing',
    artist: 'Klik Play untuk otomatis membuka & memutar Spotify',
    albumArt: undefined,
    isPlaying: false,
    duration: 0,
    position: 0,
    updatedAt: Date.now(),
  })
  const [syncedApps, setSyncedApps] = useState<SyncedAppItem[]>([
    { id: 'spotify', name: 'Spotify', isRunning: false, windowTitle: '' },
    { id: 'discord', name: 'Discord', isRunning: false, windowTitle: '' },
    { id: 'browser', name: 'Browser', isRunning: false, windowTitle: '' },
    { id: 'vscode', name: 'VS Code', isRunning: false, windowTitle: '' },
  ])
  const [activeForegroundApp, setActiveForegroundApp] = useState<string>('')

  const [clockText, setClockText] = useState('')
  const [countdownFraction, setCountdownFraction] = useState<number | null>(null)

  const dragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const collapseDeadlineRef = useRef<number | null>(null)
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragOverWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outboundDragUntilRef = useRef<number>(0)
  const hiddenCooldownUntilRef = useRef<number>(0)

  const stateRef = useRef(islandState)
  stateRef.current = islandState
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const pinnedRef = useRef(isPinned)
  pinnedRef.current = isPinned
  const hoveredRef = useRef(isHovered)
  hoveredRef.current = isHovered
  const dragOverRef = useRef(isDragOver)
  dragOverRef.current = isDragOver
  const waNotifRef = useRef(activeWaNotif)
  waNotifRef.current = activeWaNotif

  const clearDragOver = () => {
    if (dragOverWatchdogRef.current) {
      clearTimeout(dragOverWatchdogRef.current)
      dragOverWatchdogRef.current = null
    }
    dragOverRef.current = false
    setIsDragOver(false)
  }

  const enterStealthEdge = (cooldownMs = 300) => {
    if (wakeTimerRef.current) {
      clearTimeout(wakeTimerRef.current)
      wakeTimerRef.current = null
    }
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    clearDragOver()
    hiddenCooldownUntilRef.current = Date.now() + cooldownMs
    stateRef.current = 'hidden'
    setIsHovered(false)
    setIslandState('hidden')
    const viewportW = window.innerWidth > 0 ? window.innerWidth : 680
    window.dynasis?.setIslandRect((viewportW - 200) / 2, 0, 200, 6)
  }

  const triggerWhatsAppNotif = (notif: WhatsAppNotif) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    if (waNotifTimerRef.current) {
      clearTimeout(waNotifTimerRef.current)
      waNotifTimerRef.current = null
    }
    waNotifRef.current = notif
    setActiveWaNotif(notif)

    // Automatically wake / widen UI to Compact Pill mode if not already expanded
    if (stateRef.current !== 'expanded') {
      stateRef.current = 'compact'
      setIslandState('compact')
    }

    waNotifTimerRef.current = setTimeout(() => {
      waNotifTimerRef.current = null
      waNotifRef.current = null
      setActiveWaNotif(null)
      if (
        stateRef.current === 'compact' &&
        !hoveredRef.current &&
        !pinnedRef.current &&
        prefsRef.current.autoHideToEdge
      ) {
        enterStealthEdge()
      }
    }, 3250)
  }

  const updatePrefs = (patch: Partial<DynasisPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const toggleAutoStart = async () => {
    const next = !autoStart
    setAutoStart(next)
    if (window.dynasis?.setAutoStart) {
      const confirmed = await window.dynasis.setAutoStart(next)
      setAutoStart(confirmed)
    }
  }

  // Live clock for compact notch (coucou style)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setClockText(time)
    }
    updateClock()
    const id = setInterval(updateClock, 10000)
    return () => clearInterval(id)
  }, [])

  // Auto-collapse countdown loop when Stealth Edge is disabled by user
  useEffect(() => {
    if (
      islandState !== 'expanded' ||
      isPinned ||
      isHovered ||
      prefs.autoCloseSeconds <= 0
    ) {
      collapseDeadlineRef.current = null
      setCountdownFraction(null)
      return
    }

    const totalMs = prefs.autoCloseSeconds * 1000
    collapseDeadlineRef.current = Date.now() + totalMs

    const id = setInterval(() => {
      const due = collapseDeadlineRef.current
      if (!due) return
      const remaining = due - Date.now()
      if (remaining <= 0) {
        collapseDeadlineRef.current = null
        setCountdownFraction(null)
        if (prefsRef.current.autoHideToEdge) {
          enterStealthEdge()
        } else {
          setIslandState('compact')
        }
      } else {
        const showWindowMs = Math.min(10000, totalMs * 0.7)
        if (remaining < showWindowMs) {
          setCountdownFraction(Math.max(0, Math.min(1, remaining / showWindowMs)))
        } else {
          setCountdownFraction(null)
        }
      }
    }, 80)

    return () => clearInterval(id)
  }, [islandState, isPinned, isHovered, prefs.autoCloseSeconds])

  // Single Source of Truth: 60Hz Main-Process Cursor Hit-Test (coucou pattern)
  useEffect(() => {
    if (!window.dynasis?.onCursorMoved) return
    return window.dynasis.onCursorMoved(({ onIsland, onWakeStrip }) => {
      const curState = stateRef.current

      // 1. When in Stealth Edge ('hidden'), ONLY wake when cursor dwells on top 6px wake strip
      if (curState === 'hidden') {
        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current)
          leaveTimerRef.current = null
        }

        if (onWakeStrip && Date.now() >= hiddenCooldownUntilRef.current) {
          if (!wakeTimerRef.current) {
            wakeTimerRef.current = setTimeout(() => {
              wakeTimerRef.current = null
              if (stateRef.current === 'hidden') {
                setIsHovered(true)
                setIslandState(prefsRef.current.openOnHover ? 'expanded' : 'compact')
              }
            }, 110)
          }
        } else {
          if (wakeTimerRef.current) {
            clearTimeout(wakeTimerRef.current)
            wakeTimerRef.current = null
          }
          setIsHovered(false)
        }
        return
      }

      // 2. When awake ('compact', 'expanded', 'battery'), check if cursor is inside Dynasis domain
      const inDomain = onIsland || onWakeStrip

      if (inDomain) {
        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current)
          leaveTimerRef.current = null
        }
        setIsHovered(true)
        if (curState === 'compact' && prefsRef.current.openOnHover && !waNotifRef.current) {
          setIslandState('expanded')
        }
      } else {
        setIsHovered(false)
        // If dragOver was stuck because OS OLE drop finished outside window, clear it immediately!
        if (dragOverRef.current) {
          clearDragOver()
        }
        // Cursor left Dynasis domain -> return to Stealth Edge baseline unless pinned or showing WA notif
        if (
          prefsRef.current.autoHideToEdge &&
          !pinnedRef.current &&
          !dragOverRef.current &&
          !dragStartRef.current &&
          !(curState === 'compact' && waNotifRef.current)
        ) {
          if (!leaveTimerRef.current) {
            const delayMs = curState === 'expanded' ? 520 : 360
            leaveTimerRef.current = setTimeout(() => {
              leaveTimerRef.current = null
              if (
                !pinnedRef.current &&
                !dragOverRef.current &&
                !dragStartRef.current &&
                !(stateRef.current === 'compact' && waNotifRef.current)
              ) {
                enterStealthEdge()
              }
            }, delayMs)
          }
        }
      }
    })
  }, [])

  // Subscribe to System Tray commands
  useEffect(() => {
    if (!window.dynasis?.onTrayCommand) return
    return window.dynasis.onTrayCommand((cmd) => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      if (cmd === 'open') {
        setView('overview')
        setIslandState('expanded')
      } else if (cmd === 'compact') {
        setIsPinned(false)
        setIslandState('compact')
      } else if (cmd === 'stealth') {
        setIsPinned(false)
        enterStealthEdge()
      } else if (cmd === 'settings') {
        setView('settings')
        setIslandState('expanded')
      }
    })
  }, [])

  // Keyboard shortcut: Escape folds expanded island back to Stealth Edge (or compact)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (islandState === 'expanded' || isDragOver)) {
        clearDragOver()
        setIsPinned(false)
        if (prefsRef.current.autoHideToEdge) {
          enterStealthEdge()
        } else {
          setIslandState('compact')
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [islandState, isDragOver])

  // Initial media, battery & autostart fetch
  useEffect(() => {
    window.dynasis?.getCurrentMedia?.().then((data) => {
      if (data && data.hasMedia) {
        setMedia({
          title: data.title || 'Unknown Title',
          artist: data.artist || 'Unknown Artist',
          albumTitle: data.albumTitle || '',
          albumArt: data.albumArt || undefined,
          isPlaying: data.status === 'Playing',
          duration: Number(data.duration) || 0,
          position: Number(data.position) || 0,
          updatedAt: Date.now(),
          appId: data.appId || '',
        })
      }
    })

    window.dynasis?.getCurrentBattery?.().then((data) => {
      if (data && data.hasBattery) {
        setBattery({
          level: data.level,
          isCharging: data.isCharging,
        })
      }
    })

    window.dynasis?.getAutoStart?.().then((on) => {
      setAutoStart(Boolean(on))
    })

    window.dynasis?.getAppsStatus?.().then((data) => {
      if (data && Array.isArray(data.apps)) {
        setSyncedApps(data.apps)
        if (data.activeApp) setActiveForegroundApp(data.activeApp)
        setWaConnected(Boolean((data as any).waWebTabOpen || (data as any).waBridgeActive))
      }
    })
  }, [])

  // 0. Live Desktop Apps (Discord, Spotify, Browser, VS Code) listener
  useEffect(() => {
    if (!window.dynasis?.onAppsStateChanged) return
    return window.dynasis.onAppsStateChanged((data) => {
      if (data && Array.isArray(data.apps)) {
        setSyncedApps(data.apps)
        if (typeof data.activeApp === 'string') {
          setActiveForegroundApp(data.activeApp)
        }
        setWaConnected(Boolean((data as any).waWebTabOpen || (data as any).waBridgeActive))
      }
    })
  }, [])

  // 0B. Incoming WhatsApp Web Notification listener -> wakes & widens UI to Compact Pill
  useEffect(() => {
    if (!window.dynasis?.onWhatsAppNotification) return
    return window.dynasis.onWhatsAppNotification((notif) => {
      if (notif && notif.id) {
        triggerWhatsAppNotif(notif)
      }
    })
  }, [])

  const handleAppAction = async (target: string, command = 'open') => {
    await window.dynasis?.appAction?.(target, command)
  }

  // 1. Native Screenshot Capture listener
  useEffect(() => {
    if (!window.dynasis?.onScreenshotCaptured) return
    return window.dynasis.onScreenshotCaptured((data) => {
      clearDragOver()
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
        leaveTimerRef.current = null
      }
      setShelfItems((prev) => [data, ...prev].slice(0, 15))
      setView('shelf')
      stateRef.current = 'expanded'
      setIslandState('expanded')

      // Auto-retract after 4.5s if user doesn't hover or pin the island
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null
        if (!hoveredRef.current && !pinnedRef.current && !dragOverRef.current) {
          if (prefsRef.current.autoHideToEdge) {
            enterStealthEdge()
          } else {
            setIslandState('compact')
          }
        }
      }, 4500)
    })
  }, [])

  // 1B. Native Clipboard Text & Link History listener (silent background capture on Ctrl+C)
  useEffect(() => {
    if (!window.dynasis?.onClipboardTextCaptured) return
    return window.dynasis.onClipboardTextCaptured((data) => {
      setShelfItems((prev) => {
        const filtered = prev.filter((item) => item.text !== data.text)
        return [data, ...filtered].slice(0, 15)
      })
    })
  }, [])

  // 2. Real-time Windows SMTC Media listener (silent update in background; never forces island out of Stealth Edge!)
  useEffect(() => {
    if (!window.dynasis?.onMediaStateChanged) return
    return window.dynasis.onMediaStateChanged((data) => {
      if (data && data.hasMedia) {
        const isPlaying = data.status === 'Playing'
        setMedia((prev) => ({
          title: data.title || 'Unknown Title',
          artist: data.artist || 'Unknown Artist',
          albumTitle: data.albumTitle || '',
          albumArt: data.albumArt || prev.albumArt,
          isPlaying,
          duration: Number(data.duration) || 0,
          position: Number(data.position) || 0,
          updatedAt: Date.now(),
          appId: data.appId || prev.appId,
        }))
      } else {
        setMedia((m) => ({ ...m, isPlaying: false }))
      }
    })
  }, [])

  // 3. Real-time Battery & Charger listener
  const prevChargingRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (!window.dynasis?.onBatteryStateChanged) return
    return window.dynasis.onBatteryStateChanged((data) => {
      if (data && data.hasBattery) {
        setBattery({
          level: data.level,
          isCharging: data.isCharging,
        })
        const prev = prevChargingRef.current
        prevChargingRef.current = data.isCharging
        if (prev !== null && prev !== data.isCharging && stateRef.current !== 'expanded') {
          setIslandState('battery')
          setTimeout(() => {
            if (stateRef.current === 'battery') {
              if (prefsRef.current.autoHideToEdge) {
                enterStealthEdge()
              } else {
                setIslandState('compact')
              }
            }
          }, 3000)
        }
      }
    })
  }, [])

  // Window Dragging (via Move button or Alt+Drag / Middle-Click)
  const startWindowDrag = (e: React.MouseEvent) => {
    dragStartRef.current = { x: e.screenX, y: e.screenY, moved: false }

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return
      const deltaX = moveEvent.screenX - dragStartRef.current.x
      const deltaY = moveEvent.screenY - dragStartRef.current.y
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        dragStartRef.current.moved = true
      }
      dragStartRef.current = {
        x: moveEvent.screenX,
        y: moveEvent.screenY,
        moved: dragStartRef.current.moved,
      }
      window.dynasis?.moveWindowBy(deltaX, deltaY)
    }

    const onMouseUp = () => {
      setTimeout(() => {
        dragStartRef.current = null
      }, 50)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleIslandMouseDown = (e: React.MouseEvent) => {
    if (e.altKey || e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      startWindowDrag(e)
    }
  }

  const handleIslandClick = () => {
    if (dragStartRef.current?.moved) return
    if (islandState === 'compact' && activeWaNotif) {
      setActiveWaNotif(null)
      waNotifRef.current = null
      handleAppAction('whatsapp', 'open')
      enterStealthEdge(600)
      return
    }
    if (islandState === 'hidden') {
      setIslandState('compact')
    } else if (islandState === 'compact' || islandState === 'battery') {
      setIslandState('expanded')
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (islandState === 'expanded' && view === 'settings') {
      setIslandState('compact')
    } else {
      setView('settings')
      setIslandState('expanded')
    }
  }

  // Called when user drags a screenshot/file OUT of ShelfIsland so it never triggers inbound isDragOver
  const handleOutboundDragStart = () => {
    outboundDragUntilRef.current = Date.now() + 5000
    clearDragOver()
  }

  // External File Drag & Drop into Shelf
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Ignore outbound drags originating from Dynasis Shelf itself
    if (Date.now() < outboundDragUntilRef.current) return
    if (!e.dataTransfer?.types?.includes('Files')) return

    if (!isDragOver) {
      dragOverRef.current = true
      setIsDragOver(true)
      setView('shelf')
      setIslandState('expanded')
    }

    // Watchdog auto-reset: if OS drag ends outside window without firing onDragLeave/onDrop, clear after 650ms
    if (dragOverWatchdogRef.current) {
      clearTimeout(dragOverWatchdogRef.current)
    }
    dragOverWatchdogRef.current = setTimeout(() => {
      dragOverWatchdogRef.current = null
      clearDragOver()
    }, 650)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    clearDragOver()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    clearDragOver()

    if (Date.now() < outboundDragUntilRef.current) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newItems: ScreenshotItem[] = []
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]
        const filePath = (file as any).path
        const objectUrl = URL.createObjectURL(file)
        newItems.push({
          id: `file_${Date.now()}_${i}`,
          type: 'file',
          filePath,
          dataUrl: objectUrl,
          name: file.name,
          timestamp: Date.now(),
        })
      }
      setShelfItems((prev) => [...newItems, ...prev].slice(0, 15))
      setView('shelf')
      setIslandState('expanded')
    }
  }

  const simulateScreenshot = () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#047857"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <circle cx="520" cy="90" r="110" fill="#10b981" fill-opacity="0.18"/>
      <text x="48" y="160" fill="#f8fafc" font-family="Segoe UI, sans-serif" font-size="32" font-weight="bold">Dynasis Capture</text>
      <text x="48" y="205" fill="#94a3b8" font-family="Segoe UI, sans-serif" font-size="18">Ready to drag or copy to clipboard</text>
    </svg>`
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`
    const sampleItem: ScreenshotItem = {
      id: `sample_${Date.now()}`,
      type: 'image',
      dataUrl,
      name: `Capture_${new Date().toLocaleTimeString([], { hour12: false }).replace(/:/g, '')}.png`,
      timestamp: Date.now(),
      size: { width: 1920, height: 1080 },
    }
    setShelfItems((prev) => [sampleItem, ...prev].slice(0, 15))
    setView('shelf')
    setIslandState('expanded')
  }

  const handleCopyScreenshot = async (item: ScreenshotItem) => {
    if ((item.type === 'text' || item.text) && window.dynasis?.copyTextToClipboard) {
      await window.dynasis.copyTextToClipboard(item.text || '')
      return
    }
    if (item.dataUrl && window.dynasis?.copyImageToClipboard) {
      await window.dynasis.copyImageToClipboard(item.dataUrl)
    }
  }

  const handleSaveScreenshot = async (item: ScreenshotItem) => {
    if (item.dataUrl && window.dynasis?.saveScreenshot) {
      await window.dynasis.saveScreenshot(item.dataUrl)
    }
  }

  const handleDismissItem = (id: string) => {
    window.dynasis?.dismissScreenshot?.(id)
    setShelfItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleMediaAction = (
    action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek',
    value?: number
  ) => {
    window.dynasis?.mediaAction?.(action, value)
    if (action === 'play') {
      setMedia((m) => ({ ...m, isPlaying: true, updatedAt: Date.now() }))
    } else if (action === 'pause') {
      setMedia((m) => ({ ...m, isPlaying: false }))
    } else if (action === 'toggle') {
      setMedia((m) => ({ ...m, isPlaying: !m.isPlaying, updatedAt: Date.now() }))
    } else if (action === 'seek' && typeof value === 'number') {
      setMedia((m) => ({ ...m, position: value, updatedAt: Date.now() }))
    }
  }

  const hasActiveMedia = media.isPlaying || (media.title && media.title !== 'No media playing')

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full h-full flex flex-col items-center justify-start overflow-hidden bg-transparent select-none pointer-events-none"
    >
      <Island
        state={isDragOver ? 'expanded' : islandState}
        isHovered={isHovered || isDragOver}
        hasNotification={Boolean(activeWaNotif)}
        notchStyle={prefs.notchStyle}
        countdownFraction={countdownFraction}
        onClick={handleIslandClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleIslandMouseDown}
      >
        {/* ── 0. HIDDEN WAKE STRIP (5px top-edge micro-lip, 0% browser tab obstruction) ── */}
        {islandState === 'hidden' && !isDragOver && (
          <div
            className="w-full h-full flex items-center justify-center cursor-pointer"
            title="Arahkan kursor ke tepi atas untuk membuka Dynasis"
          >
            <div
              className={`w-16 h-[2.5px] rounded-full transition-colors ${
                media.isPlaying ? 'bg-emerald-400/85' : 'bg-white/35'
              }`}
            />
          </div>
        )}

        {/* ── 1. COMPACT ISLAND (Notch / Pill + Incoming WhatsApp Web Notification Mode) ── */}
        {islandState === 'compact' && !isDragOver && (
          <div
            className="relative w-full h-full flex items-center justify-between px-3 cursor-pointer group"
            title={
              activeWaNotif
                ? 'Klik untuk membuka WhatsApp Web'
                : 'Klik untuk membuka Dynasis · Klik kanan untuk Pengaturan'
            }
          >
            {activeWaNotif ? (
              <>
                {/* Incoming WhatsApp Web Notification Pill Content */}
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-[#051b11] flex items-center justify-center flex-shrink-0 shadow-sm">
                    <MessageSquare className="w-3 h-3 fill-current" />
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/35 text-[9.5px] font-bold text-emerald-300 flex-shrink-0">
                      WA
                    </span>
                    <span className="text-[11.5px] font-bold text-emerald-300 truncate max-w-[110px] flex-shrink-0">
                      {activeWaNotif.sender}:
                    </span>
                    <span className="text-[11.5px] font-medium text-[#f5f6f8] truncate flex-1">
                      {activeWaNotif.message}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveWaNotif(null)
                      waNotifRef.current = null
                      handleAppAction('whatsapp', 'open')
                      enterStealthEdge(600)
                    }}
                    className="px-2 py-0.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#04130c] text-[10px] font-bold transition-colors"
                    title="Buka & fokuskan WhatsApp Web"
                  >
                    Buka WA
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveWaNotif(null)
                      waNotifRef.current = null
                      if (prefsRef.current.autoHideToEdge && !isHovered) {
                        enterStealthEdge(400)
                      }
                    }}
                    className="p-1 rounded-full hover:bg-white/15 text-[#9398a1] hover:text-white transition-colors"
                    title="Tutup notifikasi"
                  >
                    <EyeOff className="w-3 h-3" />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Left: Album Art / Dot + Title - Artist/Band */}
                <div
                  className={`flex items-center gap-2 min-w-0 ${
                    hasActiveMedia ? 'flex-1 pr-2' : 'flex-shrink-0'
                  }`}
                >
                  {media.albumArt ? (
                    <img
                      src={media.albumArt}
                      alt=""
                      className={`w-5 h-5 rounded-full object-cover flex-shrink-0 border ${
                        media.isPlaying ? 'border-emerald-400/60' : 'border-white/15'
                      }`}
                      draggable={false}
                    />
                  ) : (
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        media.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/60'
                      }`}
                    />
                  )}
                  <span className="text-[11.5px] font-semibold text-[#f5f6f8] truncate tracking-tight">
                    {hasActiveMedia ? (
                      <>
                        {media.title}
                        {media.artist &&
                          media.artist !== 'Unknown Artist' &&
                          !media.artist.startsWith('Klik Play') && (
                            <span className="font-normal text-[#a5aab4]">
                              {' '}
                              - {media.artist}
                            </span>
                          )}
                      </>
                    ) : (
                      'Dynasis'
                    )}
                  </span>
                </div>

                {/* Center: True centered Clock when no active media */}
                {prefs.showClock && !hasActiveMedia && (
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] font-mono font-medium text-white/80 tabular-nums tracking-tight whitespace-nowrap">
                    {clockText}
                  </span>
                )}

                {/* Right: Quick Play/Pause on Hover (coucou pill style) OR Equalizer + Shelf + Battery */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                  {hasActiveMedia && isHovered ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMediaAction(media.isPlaying ? 'pause' : 'play')
                        }}
                        className="w-5 h-5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 flex items-center justify-center text-emerald-300 transition-colors"
                        title={media.isPlaying ? 'Pause' : 'Play'}
                      >
                        {media.isPlaying ? (
                          <Pause className="w-2.5 h-2.5 fill-current" />
                        ) : (
                          <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMediaAction('next')
                        }}
                        className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-colors"
                        title="Next Track"
                      >
                        <SkipForward className="w-2.5 h-2.5 fill-current" />
                      </button>
                    </div>
                  ) : (
                    media.isPlaying && (
                      <div className="flex items-end gap-[2px] h-3">
                        {[0, 1, 2, 3].map((i) => (
                          <motion.span
                            key={i}
                            className="w-[2.2px] bg-emerald-400 rounded-full"
                            animate={{ height: ['3px', '11px', '4px', '9px', '3px'] }}
                            transition={{
                              repeat: Infinity,
                              duration: 0.65,
                              delay: i * 0.14,
                              ease: 'easeInOut',
                            }}
                          />
                        ))}
                      </div>
                    )
                  )}

                  {shelfItems.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setView('shelf')
                        setIslandState('expanded')
                      }}
                      className="px-1.5 py-0.5 bg-blue-500/25 hover:bg-blue-500/40 border border-blue-400/40 text-[10px] font-bold text-blue-300 rounded-full transition-colors"
                      title={`${shelfItems.length} file di Shelf`}
                    >
                      {shelfItems.length}
                    </button>
                  )}

                  <div className="flex items-center gap-0.5 text-[10.5px] font-mono text-[#9398a1] tabular-nums">
                    {battery.isCharging && (
                      <Zap className="w-3 h-3 text-emerald-400 fill-current" />
                    )}
                    <span>{battery.level}%</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      enterStealthEdge(900)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-white/15 text-[#9398a1] hover:text-white transition-opacity"
                    title="Sembunyikan ke tepi atas (Stealth Mode) agar tab browser bebas diklik"
                  >
                    <EyeOff className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 2. BATTERY HUD POPUP ── */}
        {islandState === 'battery' && !isDragOver && (
          <BatteryHUD battery={battery} />
        )}

        {/* ── 3. EXPANDED ISLAND DASHBOARD (580x192 Coucou Multi-Tab Architecture) ── */}
        {(islandState === 'expanded' || isDragOver) && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col w-full h-full px-2.5 pt-1.5 pb-2.5 justify-between"
          >
            {/* ── Coucou-style Header Bar (32px) ── */}
            <div className="flex items-center justify-between h-8 px-1.5 flex-shrink-0">
              {/* Left Navigation Tabs */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setView('overview')}
                  className={`flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors ${
                    view === 'overview'
                      ? 'bg-[#1d1f23] text-[#f5f6f8]'
                      : 'text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.06]'
                  }`}
                  title="Overview (Media + Discord + Quick Pills)"
                >
                  <Home className="w-3 h-3" />
                  <span>Overview</span>
                </button>

                <button
                  onClick={() => setView('apps')}
                  className={`flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors ${
                    view === 'apps'
                      ? 'bg-[#1d1f23] text-[#f5f6f8]'
                      : 'text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.06]'
                  }`}
                  title="Sinkronisasi & Peluncur Aplikasi (Discord, Spotify, Browser, VS Code)"
                >
                  <AppWindow className="w-3 h-3 text-indigo-400" />
                  <span>Apps</span>
                </button>

                <button
                  onClick={() => setView('media')}
                  className={`flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors ${
                    view === 'media'
                      ? 'bg-[#1d1f23] text-[#f5f6f8]'
                      : 'text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.06]'
                  }`}
                  title="Media Player"
                >
                  <Music className="w-3 h-3 text-emerald-400" />
                  <span>Media</span>
                </button>

                <button
                  onClick={() => setView('shelf')}
                  className={`flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11px] font-medium transition-colors ${
                    view === 'shelf'
                      ? 'bg-[#1d1f23] text-[#f5f6f8]'
                      : 'text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.06]'
                  }`}
                  title="Screenshot & File Drop Shelf"
                >
                  <FolderPlus className="w-3 h-3 text-blue-400" />
                  <span>Shelf</span>
                  {shelfItems.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-blue-500/25 text-blue-300 rounded-full text-[9.5px] font-bold">
                      {shelfItems.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Right Header Actions */}
              <div className="flex items-center gap-1">
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    startWindowDrag(e)
                  }}
                  className="p-1.5 rounded-full text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.07] cursor-grab active:cursor-grabbing"
                  title="Tahan & geser untuk memindahkan posisi Dynasis"
                >
                  <Move className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setIsPinned((p) => !p)}
                  className={`p-1.5 rounded-full transition-colors ${
                    isPinned
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.07]'
                  }`}
                  title={isPinned ? 'Pinned (Tetap terbuka)' : 'Pin agar tidak menutup otomatis'}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setIsPinned(false)
                    enterStealthEdge(900)
                  }}
                  className="p-1.5 rounded-full text-[#8e939c] hover:text-amber-300 hover:bg-white/[0.07] transition-colors"
                  title="Sembunyikan ke garis tepi atas (Stealth Mode) agar tab browser tidak terhalang"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() =>
                    setView((v) => (v === 'settings' ? 'overview' : 'settings'))
                  }
                  className={`p-1.5 rounded-full transition-colors ${
                    view === 'settings'
                      ? 'bg-[#1d1f23] text-[#f5f6f8]'
                      : 'text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.07]'
                  }`}
                  title="Pengaturan Dynasis"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setIsPinned(false)
                    setIslandState('compact')
                  }}
                  className="p-1.5 rounded-full text-[#8e939c] hover:text-[#f5f6f8] hover:bg-white/[0.07] transition-colors"
                  title="Lipat ke Compact Pill (Esc)"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── Active View Body (142px height) ── */}
            <div className="relative flex-1 min-h-0 mt-1">
              {isDragOver && (
                <div
                  onClick={() => clearDragOver()}
                  className="w-full h-full rounded-[18px] bg-emerald-500/10 border-2 border-dashed border-emerald-400/60 flex flex-col items-center justify-center gap-1 text-emerald-300 cursor-pointer"
                  title="Klik untuk menutup area drop"
                >
                  <FolderPlus className="w-6 h-6 animate-bounce" />
                  <span className="text-xs font-semibold">
                    Lepaskan file di sini untuk masuk ke Dynasis Shelf
                  </span>
                  <span className="text-[10px] text-emerald-200/70">
                    (Klik di sini jika ingin membatalkan)
                  </span>
                </div>
              )}

              {/* VIEW 1: OVERVIEW */}
              {!isDragOver && view === 'overview' && (
                <div className="flex gap-2 w-full h-full min-w-0 overflow-hidden">
                  <div className="w-[326px] flex-shrink-0 h-full min-w-0">
                    <MediaIsland
                      media={media}
                      compact
                      onPlayPause={() =>
                        handleMediaAction(media.isPlaying ? 'pause' : 'play')
                      }
                      onNext={() => handleMediaAction('next')}
                      onPrevious={() => handleMediaAction('previous')}
                      onSeek={(sec) => handleMediaAction('seek', sec)}
                      onOpenApp={() => handleAppAction('spotify', 'open')}
                    />
                  </div>

                  <div className="flex-1 min-w-0 overflow-hidden h-full rounded-[18px] bg-[#141518] border border-white/[0.05] p-2 flex flex-col justify-between gap-1.5">
                    <button
                      onClick={() => setView('shelf')}
                      className="group w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0e0f11] hover:bg-blue-500/15 border border-white/[0.06] hover:border-blue-400/40 transition-all text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 flex-shrink-0">
                          <FolderPlus className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                          <span className="text-[11px] font-semibold text-[#f5f6f8] group-hover:text-blue-200 truncate block">
                            Drop Shelf
                          </span>
                          <span className="text-[9.5px] text-[#8e939c] truncate block">
                            {shelfItems.length > 0
                              ? `${shelfItems.length} item tersimpan`
                              : 'Ctrl+C / Win+Shift+S'}
                          </span>
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-[#9398a1] flex-shrink-0">
                        {shelfItems.length}
                      </span>
                    </button>

                    {/* Discord & Apps Quick Sync Card */}
                    {(() => {
                      const discordApp = syncedApps.find((a) => a.id === 'discord')
                      const isDiscordRunning = Boolean(discordApp?.isRunning)
                      return (
                        <div className="w-full min-w-0 overflow-hidden flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0e0f11] border border-white/[0.06]">
                          <button
                            onClick={() => handleAppAction('discord', 'open')}
                            className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden text-left group"
                            title="Klik untuk membuka atau memfokuskan Discord"
                          >
                            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 flex-shrink-0">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] font-semibold text-[#f5f6f8] group-hover:text-indigo-300 truncate">
                                  Discord
                                </span>
                                <span
                                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    isDiscordRunning ? 'bg-emerald-400' : 'bg-white/25'
                                  }`}
                                />
                              </div>
                              <span className="text-[9.5px] text-[#8e939c] truncate block">
                                {isDiscordRunning
                                  ? discordApp?.windowTitle || 'Aktif · Klik fokus'
                                  : 'Tertutup · Klik buka'}
                              </span>
                            </div>
                          </button>
                          <button
                            onClick={() => setView('apps')}
                            className="px-2 py-0.5 rounded-full text-[9.5px] font-medium bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 transition-colors flex-shrink-0"
                            title="Buka tab Apps Hub"
                          >
                            Apps ↗
                          </button>
                        </div>
                      )
                    })()}

                    <div className="flex items-center gap-1 w-full min-w-0">
                      <button
                        onClick={simulateScreenshot}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.05] text-[9.5px] font-medium text-[#f5f6f8] transition-colors active:scale-95 truncate"
                        title="Simulasikan tangkapan layar ke Shelf"
                      >
                        <Camera className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="truncate">Shelf</span>
                      </button>

                      <button
                        onClick={() => handleAppAction('whatsapp', 'bridge')}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[9.5px] font-medium text-emerald-300 transition-colors active:scale-95 truncate"
                        title="Buka & sinkronkan WhatsApp Web secara background di Dynasis (tanpa WA Desktop)"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            waConnected ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/40'
                          }`}
                        />
                        <span className="truncate">WA Web</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsPinned(false)
                          stateRef.current = 'compact'
                          setIslandState('compact')
                          triggerWhatsAppNotif({
                            id: `sim_wa_${Date.now()}`,
                            sender: 'WhatsApp Web',
                            message: 'Halo! Notif WA Web aktif di Compact Pill',
                            source: 'WhatsApp Web',
                            timestamp: Date.now(),
                          })
                        }}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl bg-white/[0.05] hover:bg-emerald-500/20 border border-white/[0.06] text-[9.5px] font-medium text-[#d5d8de] hover:text-emerald-300 transition-colors active:scale-95 truncate"
                        title="Simulasikan notifikasi WhatsApp Web masuk ke mode Compact Pill"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span className="truncate">Tes WA</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsPinned(false)
                          enterStealthEdge(900)
                        }}
                        className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-[9.5px] font-medium text-amber-300 transition-colors active:scale-95 truncate"
                        title="Sembunyikan ke tepi atas layar (5px)"
                      >
                        <EyeOff className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">Stealth</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 1B: APPS & SYSTEM CONTROL HUB (Spotify, Discord, Browser, VS Code + Audio) */}
              {!isDragOver && view === 'apps' && (
                <div className="w-full h-full rounded-[18px] bg-[#141518] border border-white/[0.05] px-3 py-2 flex flex-col justify-between overflow-hidden">
                  <div className="grid grid-cols-2 gap-2 min-w-0">
                    {syncedApps.map((appItem) => {
                      const isSpotify = appItem.id === 'spotify'
                      const isDiscord = appItem.id === 'discord'
                      const isBrowser = appItem.id === 'browser'
                      return (
                        <div
                          key={appItem.id}
                          className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0e0f11] border border-white/[0.06] hover:border-white/15 transition-colors min-w-0 overflow-hidden"
                        >
                          <button
                            onClick={() => handleAppAction(appItem.id, 'open')}
                            className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden text-left"
                            title={`Klik untuk membuka atau memfokuskan ${appItem.name}`}
                          >
                            <div
                              className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                isSpotify
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : isDiscord
                                    ? 'bg-indigo-500/15 text-indigo-400'
                                    : isBrowser
                                      ? 'bg-sky-500/15 text-sky-400'
                                      : 'bg-violet-500/15 text-violet-400'
                              }`}
                            >
                              {isSpotify ? (
                                <Music className="w-3.5 h-3.5" />
                              ) : isDiscord ? (
                                <MessageSquare className="w-3.5 h-3.5" />
                              ) : isBrowser ? (
                                <Globe className="w-3.5 h-3.5" />
                              ) : (
                                <Code2 className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 overflow-hidden pr-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] font-semibold text-[#f5f6f8] truncate">
                                  {appItem.name}
                                </span>
                                <span
                                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    appItem.isRunning ? 'bg-emerald-400' : 'bg-white/20'
                                  }`}
                                />
                              </div>
                              <span className="text-[9.5px] text-[#8e939c] truncate block">
                                {appItem.isRunning
                                  ? appItem.windowTitle || 'Berjalan di sistem'
                                  : 'Tertutup · Klik buka'}
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSpotify && (
                              <button
                                onClick={() => handleAppAction('spotify', 'play')}
                                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/30 text-[10px] font-semibold text-emerald-300 flex items-center gap-1 transition-colors"
                                title="Buka Spotify & langsung putar musik (bahkan saat Spotify tertutup)"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Play</span>
                              </button>
                            )}
                            {isDiscord && (
                              <button
                                onClick={() => handleAppAction('discord', 'mute')}
                                className="p-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-300 transition-colors"
                                title="Toggle Mute Mic Discord (Ctrl+Shift+M)"
                              >
                                <MicOff className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => handleAppAction(appItem.id, 'open')}
                              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[#c5c8cd] hover:text-white transition-colors"
                              title={`Buka / Fokus ${appItem.name}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Bottom Bar: Foreground App Indicator + WA Web Bridge + System Master Volume Controls */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => handleAppAction('whatsapp', 'bridge')}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] font-medium text-emerald-300 transition-colors flex-shrink-0"
                        title="Buka & sinkronkan WhatsApp Web secara background di Dynasis (tanpa WA Desktop)"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            waConnected ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/40'
                          }`}
                        />
                        <span>{waConnected ? 'WA Web Aktif' : 'Sinkron WA Web'}</span>
                      </button>
                      <span className="text-[10px] text-[#8e939c] truncate max-w-[165px]">
                        Fokus:{' '}
                        <b className="text-[#f5f6f8]">
                          {activeForegroundApp || 'Desktop'}
                        </b>
                      </span>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-[#8e939c] mr-1">Master Vol:</span>
                      <button
                        onClick={() => handleAppAction('system', 'vol-down')}
                        className="px-2 py-0.5 rounded-md bg-white/[0.07] hover:bg-white/[0.15] text-[10px] font-mono text-[#f5f6f8] transition-colors"
                        title="Turunkan Volume Sistem"
                      >
                        Vol -
                      </button>
                      <button
                        onClick={() => handleAppAction('system', 'vol-mute')}
                        className="p-1 rounded-md bg-white/[0.07] hover:bg-red-500/25 text-[#c5c8cd] hover:text-red-300 transition-colors"
                        title="Mute / Unmute Volume Sistem"
                      >
                        <VolumeX className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleAppAction('system', 'vol-up')}
                        className="px-2 py-0.5 rounded-md bg-white/[0.07] hover:bg-white/[0.15] text-[10px] font-mono text-[#f5f6f8] transition-colors"
                        title="Naikkan Volume Sistem"
                      >
                        Vol +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 2: FULL MEDIA VIEW */}
              {!isDragOver && view === 'media' && (
                <MediaIsland
                  media={media}
                  onPlayPause={() =>
                    handleMediaAction(media.isPlaying ? 'pause' : 'play')
                  }
                  onNext={() => handleMediaAction('next')}
                  onPrevious={() => handleMediaAction('previous')}
                  onSeek={(sec) => handleMediaAction('seek', sec)}
                  onOpenApp={() => handleAppAction('spotify', 'open')}
                />
              )}

              {/* VIEW 3: SHELF & FILE DROP BOX VIEW */}
              {!isDragOver && view === 'shelf' && (
                <ShelfIsland
                  items={shelfItems}
                  onDismiss={handleDismissItem}
                  onClearAll={() => setShelfItems([])}
                  onCopy={handleCopyScreenshot}
                  onSave={handleSaveScreenshot}
                  onSimulateScreenshot={simulateScreenshot}
                  onOutboundDragStart={handleOutboundDragStart}
                />
              )}

              {/* VIEW 4: COUCOU-STYLE SETTINGS VIEW (with Windows Startup Toggle) */}
              {!isDragOver && view === 'settings' && (
                <div className="w-full h-full rounded-[18px] bg-[#141518] border border-white/[0.05] px-3.5 py-2.5 flex flex-col justify-between text-xs">
                  {/* Row 1: 3 Toggles (Launch at Startup, Open on Hover, Auto-Stealth Edge) */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={toggleAutoStart}
                      className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-[#0e0f11] border border-white/[0.06] hover:border-white/15 transition-colors"
                    >
                      <div className="flex flex-col text-left min-w-0 pr-1">
                        <span className="text-[11px] font-semibold text-[#f5f6f8] truncate">
                          Auto-Start OS
                        </span>
                        <span className="text-[9.5px] text-[#8e939c] truncate">
                          {autoStart ? 'Aktif saat boot' : 'Manual'}
                        </span>
                      </div>
                      <div
                        className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center flex-shrink-0 ${
                          autoStart ? 'bg-emerald-500 justify-end' : 'bg-white/15 justify-start'
                        }`}
                      >
                        <div className="w-3 h-3 rounded-full bg-white shadow" />
                      </div>
                    </button>

                    <button
                      onClick={() => updatePrefs({ openOnHover: !prefs.openOnHover })}
                      className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-[#0e0f11] border border-white/[0.06] hover:border-white/15 transition-colors"
                    >
                      <div className="flex flex-col text-left min-w-0 pr-1">
                        <span className="text-[11px] font-semibold text-[#f5f6f8] truncate">
                          Open on Hover
                        </span>
                        <span className="text-[9.5px] text-[#8e939c] truncate">
                          {prefs.openOnHover ? 'Sentuh buka' : 'Klik buka'}
                        </span>
                      </div>
                      <div
                        className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center flex-shrink-0 ${
                          prefs.openOnHover ? 'bg-emerald-500 justify-end' : 'bg-white/15 justify-start'
                        }`}
                      >
                        <div className="w-3 h-3 rounded-full bg-white shadow" />
                      </div>
                    </button>

                    <button
                      onClick={() =>
                        updatePrefs({ autoHideToEdge: !prefs.autoHideToEdge })
                      }
                      className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-[#0e0f11] border border-white/[0.06] hover:border-white/15 transition-colors"
                    >
                      <div className="flex flex-col text-left min-w-0 pr-1">
                        <span className="text-[11px] font-semibold text-[#f5f6f8] truncate">
                          Stealth Edge
                        </span>
                        <span className="text-[9.5px] text-[#8e939c] truncate">
                          {prefs.autoHideToEdge ? 'Auto lipat 5px' : 'Tetap pill'}
                        </span>
                      </div>
                      <div
                        className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center flex-shrink-0 ${
                          prefs.autoHideToEdge
                            ? 'bg-emerald-500 justify-end'
                            : 'bg-white/15 justify-start'
                        }`}
                      >
                        <div className="w-3 h-3 rounded-full bg-white shadow" />
                      </div>
                    </button>
                  </div>

                  {/* Row 2: Auto-Close Timer + Notch Shape */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 bg-[#0e0f11] px-2.5 py-1.5 rounded-xl border border-white/[0.06]">
                      <span className="text-[10.5px] text-[#9398a1]">Auto-close:</span>
                      <div className="flex items-center gap-1 bg-white/[0.05] p-0.5 rounded-lg">
                        {[10, 15, 30, 0].map((sec) => (
                          <button
                            key={sec}
                            onClick={() => updatePrefs({ autoCloseSeconds: sec })}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                              prefs.autoCloseSeconds === sec
                                ? 'bg-[#f5f6f8] text-[#0b0c0e]'
                                : 'text-[#8e939c] hover:text-white'
                            }`}
                          >
                            {sec === 0 ? 'Never' : `${sec}s`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-[#0e0f11] px-2.5 py-1.5 rounded-xl border border-white/[0.06]">
                      <span className="text-[10.5px] text-[#9398a1]">Style:</span>
                      <div className="flex items-center gap-1 bg-white/[0.05] p-0.5 rounded-lg">
                        {(['notch', 'pill'] as NotchStyle[]).map((st) => (
                          <button
                            key={st}
                            onClick={() => updatePrefs({ notchStyle: st })}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium capitalize transition-colors ${
                              prefs.notchStyle === st
                                ? 'bg-[#f5f6f8] text-[#0b0c0e]'
                                : 'text-[#8e939c] hover:text-white'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: System Tray Hint, Position Reset, and Quit */}
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] text-[#6b7079]">
                      Aktif di <b className="text-[#9398a1]">System Tray</b> · <kbd className="px-1 py-0.5 bg-white/10 rounded text-[#9398a1]">Alt+\</kbd> Toggle · <kbd className="px-1 py-0.5 bg-white/10 rounded text-[#9398a1]">Alt+Drag</kbd> Geser
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => window.dynasis?.resetWindowPosition()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-[10.5px] text-[#f5f6f8] transition-colors"
                        title="Kembalikan posisi ke tengah atas layar"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Pos</span>
                      </button>

                      <button
                        onClick={() => window.dynasis?.closeApp()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-[10.5px] text-red-300 transition-colors"
                        title="Keluar dari Dynasis"
                      >
                        <Power className="w-3 h-3" />
                        <span>Quit</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Island>
    </div>
  )
}
