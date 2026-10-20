import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Music, Camera, Zap, X, Power, FolderPlus } from 'lucide-react'
import { Island, IslandMode } from './components/Island'
import { MediaIsland, MediaState } from './components/MediaIsland'
import { ShelfIsland, ScreenshotItem } from './components/ShelfIsland'
import { BatteryHUD, BatteryState } from './components/BatteryHUD'

export default function App() {
  const [mode, setMode] = useState<IslandMode>('idle')
  const [isHovered, setIsHovered] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
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
          setMedia({
            title: data.title || 'Unknown Title',
            artist: data.artist || 'Unknown Artist',
            albumArt: undefined,
            isPlaying,
            duration: 0,
            position: 0,
          })
        }
      })
      return cleanup
    }
  }, [])

  // 3. Listen to real Windows battery & charger state updates
  useEffect(() => {
    if (window.dynasis?.onBatteryStateChanged) {
      const cleanup = window.dynasis.onBatteryStateChanged((data) => {
        if (data && data.hasBattery) {
          setBattery({
            level: data.level,
            isCharging: data.isCharging,
          })
          // If charger state was triggered, show battery pill for 3.5s
          setMode('battery')
          setTimeout(() => {
            setMode((current) => (current === 'battery' ? 'idle' : current))
          }, 3500)
        }
      })
      return cleanup
    }
  }, [])

  const handleMouseEnter = () => {
    setIsHovered(true)
    window.dynasis?.setIgnoreMouseEvents(false)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    window.dynasis?.setIgnoreMouseEvents(true, { forward: true })
  }

  const handleIslandClick = () => {
    if (mode === 'idle') {
      if (shelfItems.length > 0) {
        setMode('shelf')
      } else if (media.isPlaying) {
        setMode('media')
      } else {
        setMode('menu')
      }
    }
  }

  // Handle external file dropped onto Dynasis
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
    window.dynasis?.setIgnoreMouseEvents(false)
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
    // Optimistic update
    if (action === 'play') setMedia((m) => ({ ...m, isPlaying: true }))
    if (action === 'pause') setMedia((m) => ({ ...m, isPlaying: false }))
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-screen h-screen flex flex-col items-center justify-start overflow-hidden pointer-events-auto"
    >
      <Island
        mode={isDragOver ? 'shelf' : mode}
        isHovered={isHovered || isDragOver}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleIslandClick}
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
            {/* Left mini status */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-white tracking-wider">
                DYNASIS
              </span>
            </div>

            {/* Right mini indicators */}
            <div className="flex items-center gap-2">
              {media.isPlaying && (
                <div className="flex items-end gap-[1.5px] h-3">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[2.5px] bg-white rounded-full"
                      animate={{ height: ['3px', '11px', '4px'] }}
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
                <span
                  className="px-1.5 py-0.2 bg-blue-500 text-[9px] font-bold text-white rounded-full"
                  title={`${shelfItems.length} items in shelf`}
                >
                  {shelfItems.length}
                </span>
              )}
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
            className="flex flex-col w-full h-full p-2.5 text-white"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-white/10 px-1">
              <span className="text-[11px] font-semibold text-neutral-300">Dynasis Quick Controls</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMode('idle')
                }}
                className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-around pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  simulateScreenshot()
                }}
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-white/10 active:scale-95 transition-all"
                title="Test Screenshot"
              >
                <Camera className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-neutral-300">Screenshot</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMode('media')
                }}
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-white/10 active:scale-95 transition-all"
                title="Media Player"
              >
                <Music className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-neutral-300">Media</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMode('battery')
                  setTimeout(() => setMode('idle'), 3500)
                }}
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-white/10 active:scale-95 transition-all"
                title="Battery HUD"
              >
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] text-neutral-300">Battery</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  window.dynasis?.closeApp()
                }}
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-red-500/20 active:scale-95 transition-all"
                title="Quit Dynasis"
              >
                <Power className="w-4 h-4 text-red-400" />
                <span className="text-[10px] text-red-400">Exit</span>
              </button>
            </div>
          </motion.div>
        )}
      </Island>
    </div>
  )
}
