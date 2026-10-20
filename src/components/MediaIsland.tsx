import React, { useState, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react'
import { motion } from 'framer-motion'

export interface MediaState {
  title: string
  artist: string
  albumTitle?: string
  albumArt?: string
  isPlaying: boolean
  duration: number
  position: number
  updatedAt?: number
  appId?: string
}

interface MediaIslandProps {
  media: MediaState
  compact?: boolean
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
  onSeek?: (seconds: number) => void
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const MediaIsland: React.FC<MediaIslandProps> = ({
  media,
  compact = false,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
}) => {
  const [now, setNow] = useState(() => Date.now())
  const [dragFraction, setDragFraction] = useState<number | null>(null)
  const [barHovered, setBarHovered] = useState(false)

  // Live 500ms clock while playing so progress bar advances smoothly like coucou
  useEffect(() => {
    if (!media.isPlaying) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [media.isPlaying])

  const elapsedSinceUpdate =
    media.isPlaying && media.updatedAt ? Math.max(0, (now - media.updatedAt) / 1000) : 0
  const rawPos = media.position + elapsedSinceUpdate
  const duration = media.duration > 0 ? media.duration : 0
  const currentPos =
    dragFraction !== null
      ? dragFraction * duration
      : duration > 0
        ? Math.min(duration, rawPos)
        : rawPos
  const fraction =
    dragFraction !== null
      ? dragFraction
      : duration > 0
        ? Math.min(1, Math.max(0, currentPos / duration))
        : 0

  const handleBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const calc = (clientX: number) =>
      Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))

    setDragFraction(calc(e.clientX))

    const onMove = (moveEvt: PointerEvent) => {
      setDragFraction(calc(moveEvt.clientX))
    }
    const onUp = (upEvt: PointerEvent) => {
      const finalFrac = calc(upEvt.clientX)
      setDragFraction(null)
      onSeek?.(finalFrac * duration)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative flex flex-col justify-between w-full h-full p-3.5 rounded-[18px] bg-[#141518] border border-white/[0.05] text-white overflow-hidden"
    >
      {/* Subtle radial wash behind card */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background: media.isPlaying
            ? 'radial-gradient(240px 180px at 20% 110%, rgba(34, 197, 94, 0.35) 0%, transparent 70%)'
            : 'radial-gradient(240px 180px at 20% 110%, rgba(148, 163, 184, 0.15) 0%, transparent 70%)',
        }}
      />

      {/* Top Row: Artwork + Title/Artist + Equalizer */}
      <div className="relative z-10 flex items-center gap-3 min-w-0">
        <div
          className={`${
            compact ? 'w-11 h-11' : 'w-12 h-12'
          } relative rounded-xl overflow-hidden shadow-md bg-[#0e0f11] flex-shrink-0 flex items-center justify-center border border-white/10`}
        >
          {media.albumArt ? (
            <img
              src={media.albumArt}
              alt={media.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <Music className="w-5 h-5 text-emerald-400/80" />
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                media.isPlaying ? 'bg-emerald-400' : 'bg-neutral-500'
              }`}
            />
            <span className="text-[12.5px] font-semibold truncate text-[#f5f6f8] tracking-tight">
              {media.title || 'No media playing'}
            </span>
          </div>
          <span className="text-[11px] text-[#9398a1] truncate mt-0.5">
            {media.artist || 'Play music in Spotify, YouTube, or browser'}
            {media.albumTitle ? ` · ${media.albumTitle}` : ''}
          </span>
        </div>

        {/* Animated Waveform Indicator */}
        {media.isPlaying && (
          <div className="flex items-end gap-[2px] h-3.5 px-1 flex-shrink-0">
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="w-[2.5px] bg-emerald-400 rounded-full"
                animate={{ height: ['3px', '13px', '5px', '11px', '4px'] }}
                transition={{
                  repeat: Infinity,
                  duration: 0.75,
                  delay: i * 0.14,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Middle Row: Coucou-style Seek / Progress Bar */}
      <div className="relative z-10 flex items-center gap-2 my-1">
        <span className="text-[10px] font-mono text-[#8e939c] w-7 text-right tabular-nums">
          {formatTime(currentPos)}
        </span>

        <div
          onMouseEnter={() => setBarHovered(true)}
          onMouseLeave={() => setBarHovered(false)}
          onPointerDown={handleBarPointerDown}
          className={`relative flex-1 h-4 flex items-center ${
            duration > 0 ? 'cursor-pointer' : 'cursor-default opacity-50'
          }`}
          title={duration > 0 ? 'Click or drag to seek' : undefined}
        >
          <div className="w-full h-[3.5px] bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-colors duration-150"
              style={{
                width: `${fraction * 100}%`,
                background:
                  barHovered || dragFraction !== null ? '#1DB954' : '#C5C8CD',
              }}
            />
          </div>
          {(barHovered || dragFraction !== null) && duration > 0 && (
            <div
              className="absolute w-2.5 h-2.5 rounded-full bg-white shadow border border-black/30 -translate-x-1/2 pointer-events-none"
              style={{ left: `${fraction * 100}%` }}
            />
          )}
        </div>

        <span className="text-[10px] font-mono text-[#8e939c] w-8 tabular-nums">
          {duration > 0 ? `-${formatTime(Math.max(0, duration - currentPos))}` : '0:00'}
        </span>
      </div>

      {/* Bottom Row: Media Transport Controls */}
      <div className="relative z-10 flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-[#6b7079] truncate max-w-[110px]">
          {(() => {
            const id = (media.appId || '').toLowerCase()
            if (id.includes('spotify')) return 'Spotify'
            if (id.includes('chrome')) return 'Chrome'
            if (id.includes('msedge') || id.includes('edge')) return 'Edge'
            if (id.includes('firefox')) return 'Firefox'
            if (id.includes('brave')) return 'Brave'
            if (id.includes('vlc')) return 'VLC'
            if (id.includes('applemusic') || id.includes('itunes')) return 'Apple Music'
            return media.appId
              ? media.appId.replace(/\.exe$/i, '').split(/[!_]/)[0]
              : 'System Media'
          })()}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPrevious()
            }}
            className="p-1.5 text-[#c5c8cd] hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-90"
            title="Previous Track"
          >
            <SkipBack className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlayPause()
            }}
            className="w-7 h-7 bg-[#f5f6f8] text-[#0b0c0e] hover:bg-white transition-transform rounded-full shadow flex items-center justify-center active:scale-90"
            title={media.isPlaying ? 'Pause' : 'Play'}
          >
            {media.isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            className="p-1.5 text-[#c5c8cd] hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-90"
            title="Next Track"
          >
            <SkipForward className="w-3.5 h-3.5 fill-current" />
          </button>
        </div>

        <div className="w-[60px] text-right">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              media.isPlaying
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-white/5 text-[#6b7079]'
            }`}
          >
            {media.isPlaying ? 'LIVE' : 'IDLE'}
          </span>
        </div>
      </div>
    </div>
  )
}
