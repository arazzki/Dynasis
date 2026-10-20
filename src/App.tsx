import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Music, Camera, Zap, X, Power } from 'lucide-react'
import { Island, IslandMode } from './components/Island'
import { MediaIsland, MediaState } from './components/MediaIsland'
import { ShelfIsland, ScreenshotItem } from './components/ShelfIsland'
import { BatteryHUD, BatteryState } from './components/BatteryHUD'

export default function App() {
  const [mode, setMode] = useState<IslandMode>('idle')
  const [isHovered, setIsHovered] = useState(false)
  const [screenshot, setScreenshot] = useState<ScreenshotItem | null>(null)
  const [battery] = useState<BatteryState>({ level: 92, isCharging: true })
  const [media, setMedia] = useState<MediaState>({
    title: 'Starboy',
    artist: 'The Weeknd, Daft Punk',
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80',
    isPlaying: true,
    duration: 230,
    position: 45,
  })

  // Listen to native Electron screenshot capture
  useEffect(() => {
    if (window.dynasis?.onScreenshotCaptured) {
      const cleanup = window.dynasis.onScreenshotCaptured((data) => {
        setScreenshot(data)
        setMode('shelf')
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
      if (screenshot) {
        setMode('shelf')
      } else if (media.isPlaying) {
        setMode('media')
      } else {
        setMode('menu')
      }
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
    setScreenshot(mockScreenshot)
    setMode('shelf')
  }

  const handleCopyScreenshot = async () => {
    if (screenshot?.dataUrl && window.dynasis?.copyImageToClipboard) {
      await window.dynasis.copyImageToClipboard(screenshot.dataUrl)
    }
  }

  const handleSaveScreenshot = async () => {
    if (screenshot?.dataUrl && window.dynasis?.saveScreenshot) {
      await window.dynasis.saveScreenshot(screenshot.dataUrl)
    }
  }

  const handleDismissScreenshot = () => {
    if (screenshot?.id && window.dynasis?.dismissScreenshot) {
      window.dynasis.dismissScreenshot(screenshot.id)
    }
    setScreenshot(null)
    setMode('idle')
  }

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-start overflow-hidden pointer-events-auto">
      <Island
        mode={mode}
        isHovered={isHovered}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleIslandClick}
      >
        {/* 1. IDLE MODE */}
        {mode === 'idle' && (
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
              {screenshot && (
                <span className="w-2 h-2 rounded-full bg-blue-400" title="Screenshot available" />
              )}
            </div>
          </motion.div>
        )}

        {/* 2. MEDIA PLAYER MODE */}
        {mode === 'media' && (
          <MediaIsland
            key="media"
            media={media}
            onPlayPause={() => setMedia((m) => ({ ...m, isPlaying: !m.isPlaying }))}
            onNext={() => setMedia((m) => ({ ...m, title: 'Blinding Lights', artist: 'The Weeknd' }))}
            onPrevious={() => setMedia((m) => ({ ...m, title: 'Save Your Tears', artist: 'The Weeknd' }))}
          />
        )}

        {/* 3. SCREENSHOT & DROP SHELF MODE */}
        {mode === 'shelf' && screenshot && (
          <ShelfIsland
            key="shelf"
            screenshot={screenshot}
            onDismiss={handleDismissScreenshot}
            onCopy={handleCopyScreenshot}
            onSave={handleSaveScreenshot}
          />
        )}

        {/* 4. BATTERY HUD MODE */}
        {mode === 'battery' && (
          <BatteryHUD key="battery" battery={battery} />
        )}

        {/* 5. QUICK MENU / SWITCHER MODE */}
        {mode === 'menu' && (
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
