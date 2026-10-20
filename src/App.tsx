import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Music, Camera, Zap, X, Power, FolderPlus, EyeOff, Eye, Move, RotateCcw, LayoutGrid } from 'lucide-react'
import { Island, IslandMode } from './components/Island'
import { MediaIsland, MediaState } from './components/MediaIsland'
import { ShelfIsland, ScreenshotItem } from './components/ShelfIsland'
import { BatteryHUD, BatteryState } from './components/BatteryHUD'

const windowBounds: Record<IslandMode, { width: number; height: number }> = {
  idle: { width: 260, height: 58 },
  battery: { width: 280, height: 68 },
  media: { width: 470, height: 112 },
  shelf: { width: 510, height: 122 },
  menu: { width: 410, height: 168 },
}

export default function App() {
  const [mode, setMode] = useState<IslandMode>('idle')
  const [isHovered, setIsHovered] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [autoHide, setAutoHide] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dynasis_autohide') === 'true'
    } catch {
      return false
    }
  })
  const [shelfItems, setShelfItems] = useState<ScreenshotItem[]>([])
  const [battery, setBattery] = useState<BatteryState>({ level: 100, isCharging: false })
  const [media, setMedia] = useState<MediaState>({
    title: 'No media playing',
    artist: 'Windows SMTC Standby',
    albumArt: undefined,
    isPlaying: false,
    duration: 0,
    position: 0,
  })

  const dragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const lastSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const shrinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleAutoHide = () => {
    setAutoHide((prev) => {
      const next = !prev
      try {
        localStorage.setItem('dynasis_autohide', String(next))
      } catch { /* ignore */ }
      return next
    })
  }

  // Synchronize window size with Island mode and auto-hide status
  useEffect(() => {
    const activeMode = isDragOver ? 'shelf' : mode
    const bounds = windowBounds[activeMode]
    const extraWidth = isHovered && mode === 'idle' ? 35 : 0

    // When auto-hidden and not hovered, window height is 28px so browser tabs below stay clickable
    const targetHeight = autoHide && !isHovered && mode === 'idle' && !isDragOver
      ? 28
      : bounds.height
    const w = bounds.width + extraWidth
    const h = targetHeight

    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current)
    const last = lastSizeRef.current
    const apply = () => {
      lastSizeRef.current = { w, h }
      window.dynasis?.setIslandSize(w, h)
    }
    if (w >= last.w && h >= last.h) {
      apply() // growing: resize before animation starts
    } else {
      // shrinking: wait for spring animation to finish first
      if (w > last.w || h > last.h) {
        const grown = { w: Math.max(w, last.w), h: Math.max(h, last.h) }
        lastSizeRef.current = grown
        window.dynasis?.setIslandSize(grown.w, grown.h)
      }
      shrinkTimerRef.current = setTimeout(apply, 380)
    }
  }, [mode, isHovered, isDragOver, autoHide])

  // Fetch initial media and battery on mount
  useEffect(() => {
    if (window.dynasis?.getCurrentMedia) {
      window.dynasis.getCurrentMedia().then((data) => {
        if (data && data.hasMedia) {
          setMedia({
            title: data.title || 'Unknown Title',
            artist: data.artist || 'Unknown Artist',
            albumArt: data.albumArt || undefined,
            isPlaying: data.status === 'Playing',
            duration: 0,
            position: 0,
          })
        }
      })
    }

    if (window.dynasis?.getCurrentBattery) {
      window.dynasis.getCurrentBattery().then((data) => {
        if (data && data.hasBattery) {
          setBattery({
            level: data.level,
            isCharging: data.isCharging,
          })
        }
      })
    }
  }, [])

  // 1. Listen to native screenshot capture from Electron
  useEffect(() => {
    if (window.dynasis?.onScreenshotCaptured) {
      const cleanup = window.dynasis.onScreenshotCaptured((data) => {
        setShelfItems((prev) => [data, ...prev])
        setMode('shelf')
      })
      return cleanup
    }
  }, [])

  // 2. Listen to real Windows media session updates
  useEffect(() => {
    if (window.dynasis?.onMediaStateChanged) {
      const cleanup = window.dynasis.onMediaStateChanged((data) => {
        if (data && data.hasMedia) {
          const isPlaying = data.status === 'Playing'
          setMedia((prev) => ({
            title: data.title || 'Unknown Title',
            artist: data.artist || 'Unknown Artist',
            albumArt: data.albumArt || prev.albumArt,
            isPlaying,
            duration: 0,
            position: 0,
          }))
        } else {
          setMedia((m) => ({ ...m, isPlaying: false }))
        }
      })
      return cleanup
    }
  }, [])

  // 3. Listen to real Windows battery & charger state updates
  const prevChargingRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (window.dynasis?.onBatteryStateChanged) {
      const cleanup = window.dynasis.onBatteryStateChanged((data) => {
        if (data && data.hasBattery) {
          setBattery({
            level: data.level,
            isCharging: data.isCharging,
          })
          const prev = prevChargingRef.current
          prevChargingRef.current = data.isCharging
          // Only pop the HUD when charger is plugged / unplugged, and only from idle
          if (prev !== null && prev !== data.isCharging) {
            setMode((current) => (current === 'idle' ? 'battery' : current))
            setTimeout(() => {
              setMode((current) => (current === 'battery' ? 'idle' : current))
            }, 3500)
          }
        }
      })
      return cleanup
    }
  }, [])

  const handleIslandClick = () => {
    if (dragStartRef.current?.moved) return
    if (mode === 'idle') {
      if (shelfItems.length > 0) {
        setMode('shelf')
      } else if (media.isPlaying || media.title !== 'No media playing') {
        setMode('media')
      } else {
        setMode('menu')
      }
    } else if (mode === 'battery') {
      setMode('idle')
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMode((current) => (current === 'menu' ? 'idle' : 'menu'))
  }

  // Drag Island Window to Reposition (via drag handle or Alt+Drag anywhere)
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
    // Allow Alt + Left Click or Middle Click anywhere on the island to drag it
    if (e.altKey || e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      startWindowDrag(e)
    }
  }

  const handleWindowDragStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    startWindowDrag(e)
  }

  // Handle external file dropped onto Dynasis
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newItems: ScreenshotItem[] = []
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]
        const filePath = (file as any).path
        const objectUrl = URL.createObjectURL(file)

        newItems.push({
          id: `file_${Date.now()}_${i}`,
          filePath,
          dataUrl: objectUrl,
          name: file.name,
          timestamp: Date.now(),
        })
      }

      setShelfItems((prev) => [...newItems, ...prev])
      setMode('shelf')
    }
  }

  // Simulated screenshot for testing
  const simulateScreenshot = () => {
    const mockScreenshot: ScreenshotItem = {
      id: `mock_${Date.now()}`,
      dataUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
      timestamp: Date.now(),
      size: { width: 1920, height: 1080 },
    }
    setShelfItems((prev) => [mockScreenshot, ...prev])
    setMode('shelf')
  }

  const handleCopyScreenshot = async (item: ScreenshotItem) => {
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
    if (window.dynasis?.dismissScreenshot) {
      window.dynasis.dismissScreenshot(id)
    }
    const remaining = shelfItems.filter((item) => item.id !== id)
    setShelfItems(remaining)
    if (remaining.length === 0) {
      setMode('idle')
    }
  }

  // Media Controls dispatch
  const handleMediaAction = (action: 'play' | 'pause' | 'next' | 'previous') => {
    if (window.dynasis?.mediaAction) {
      window.dynasis.mediaAction(action)
    }
    if (action === 'play') setMedia((m) => ({ ...m, isPlaying: true }))
    if (action === 'pause') setMedia((m) => ({ ...m, isPlaying: false }))
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full h-full flex flex-col items-center justify-start overflow-hidden bg-transparent select-none"
    >
      <Island
        mode={isDragOver ? 'shelf' : mode}
        isHovered={isHovered || isDragOver}
        isAutoHide={autoHide}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleIslandClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleIslandMouseDown}
      >
        {/* Drag-in Feedback */}
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 w-full h-full text-emerald-400 font-medium text-xs border-2 border-dashed border-emerald-400/50 rounded-full"
          >
            <FolderPlus className="w-5 h-5 animate-bounce" />
            <span>Drop file to park on shelf</span>
          </motion.div>
        )}

        {/* 1. IDLE MODE */}
        {!isDragOver && mode === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between w-full px-3 text-neutral-400 text-xs font-medium"
          >
            {/* Left: Mini Album Art or Dot + Track Title */}
            <div className="flex items-center gap-2 overflow-hidden max-w-[130px]">
              {media.albumArt ? (
                <img
                  src={media.albumArt}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover flex-shrink-0 border border-white/15"
                />
              ) : (
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    media.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                  }`}
                />
              )}
              <span className="text-[11px] font-semibold text-white truncate tracking-tight">
                {media.isPlaying || media.title !== 'No media playing' ? media.title : 'DYNASIS'}
              </span>
            </div>

            {/* Right: Waveform, Shelf Count Badge, and Quick Menu Button */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {media.isPlaying && (
                <div className="flex items-end gap-[1.5px] h-3 mr-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[2.5px] bg-emerald-400 rounded-full"
                      animate={{ height: ['3px', '12px', '4px'] }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.6,
                        delay: i * 0.18,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>
              )}

              {shelfItems.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMode('shelf')
                  }}
                  className="px-1.5 py-0.5 bg-blue-500 hover:bg-blue-400 text-[9px] font-bold text-white rounded-full transition-colors"
                  title={`${shelfItems.length} item(s) in shelf — click to open`}
                >
                  {shelfItems.length}
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMode('menu')
                }}
                className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Open Quick Controls (or Right-Click)"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}

        {/* 2. MEDIA PLAYER MODE */}
        {!isDragOver && mode === 'media' && (
          <MediaIsland
            key="media"
            media={media}
            onPlayPause={() => handleMediaAction(media.isPlaying ? 'pause' : 'play')}
            onNext={() => handleMediaAction('next')}
            onPrevious={() => handleMediaAction('previous')}
            onCollapse={() => setMode('idle')}
            onOpenMenu={() => setMode('menu')}
          />
        )}

        {/* 3. SCREENSHOT & DROP SHELF MODE */}
        {!isDragOver && mode === 'shelf' && shelfItems.length > 0 && (
          <ShelfIsland
            key="shelf"
            items={shelfItems}
            onDismiss={handleDismissItem}
            onCopy={handleCopyScreenshot}
            onSave={handleSaveScreenshot}
            onCollapse={() => setMode('idle')}
            onOpenMenu={() => setMode('menu')}
          />
        )}

        {/* 4. BATTERY HUD MODE */}
        {!isDragOver && mode === 'battery' && (
          <BatteryHUD key="battery" battery={battery} />
        )}

        {/* 5. QUICK MENU / SWITCHER MODE */}
        {!isDragOver && mode === 'menu' && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col w-full h-full p-3 text-white justify-between"
          >
            {/* Header with Title + Drag Handle + Controls */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 px-1">
              <div
                onMouseDown={handleWindowDragStart}
                className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-neutral-300 hover:text-white"
                title="Hold & drag to move Dynasis anywhere (or Alt+Drag)"
              >
                <Move className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-[11px] font-semibold tracking-wide">Dynasis Controls</span>
              </div>

              <div className="flex items-center gap-1">
                {/* Auto-Hide Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleAutoHide()
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    autoHide
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/10 text-neutral-300 border-white/10 hover:bg-white/20'
                  }`}
                  title={autoHide ? 'Auto-Hide ON (Slides up when idle)' : 'Pinned (Click to enable Auto-Hide)'}
                >
                  {autoHide ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{autoHide ? 'Auto-Hide' : 'Pinned'}</span>
                </button>

                {/* Reset Position */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.dynasis?.resetWindowPosition()
                  }}
                  className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white"
                  title="Reset Position to Top Center"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>

                {/* Close Menu */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMode('idle')
                  }}
                  className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white ml-0.5"
                  title="Minimize to Pill"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Action Buttons Grid */}
            <div className="grid grid-cols-4 gap-2 pt-2 pb-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (shelfItems.length > 0) {
                    setMode('shelf')
                  } else {
                    simulateScreenshot()
                  }
                }}
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/15 active:scale-95 transition-all border border-white/5"
                title={shelfItems.length > 0 ? 'Open Shelf' : 'Simulate Screenshot Capture'}
              >
                <Camera className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-neutral-300 font-medium">
                  {shelfItems.length > 0 ? `Shelf (${shelfItems.length})` : 'Screenshot'}
                </span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMode('media')
                }}
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/15 active:scale-95 transition-all border border-white/5"
                title="Open Media Player"
              >
                <Music className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Media</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMode('battery')
                  setTimeout(() => setMode((m) => (m === 'battery' ? 'idle' : m)), 3500)
                }}
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/15 active:scale-95 transition-all border border-white/5"
                title="Show Battery Status"
              >
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] text-neutral-300 font-medium">
                  {battery.level}%
                </span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  window.dynasis?.closeApp()
                }}
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-red-500/10 hover:bg-red-500/25 active:scale-95 transition-all border border-red-500/20"
                title="Quit Dynasis"
              >
                <Power className="w-4 h-4 text-red-400" />
                <span className="text-[10px] text-red-400 font-medium">Exit</span>
              </button>
            </div>
          </motion.div>
        )}
      </Island>
    </div>
  )
}
