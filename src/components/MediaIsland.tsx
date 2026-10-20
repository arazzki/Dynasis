import React from 'react'
import { Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react'
import { motion } from 'framer-motion'

export interface MediaState {
  title: string
  artist: string
  albumArt?: string
  isPlaying: boolean
  duration: number
  position: number
}

interface MediaIslandProps {
  media: MediaState
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
}

export const MediaIsland: React.FC<MediaIslandProps> = ({
  media,
  onPlayPause,
  onNext,
  onPrevious,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="flex items-center justify-between w-full h-full px-4 text-white"
    >
      {/* Left: Album Artwork + Equalizer */}
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md bg-neutral-800 flex-shrink-0 flex items-center justify-center border border-white/10">
          {media.albumArt ? (
            <img
              src={media.albumArt}
              alt={media.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Music className="w-6 h-6 text-neutral-400" />
          )}

          {/* Mini pulse if playing */}
          {media.isPlaying && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-end justify-center pb-1 gap-[2px]">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 bg-white rounded-full"
                  animate={{
                    height: media.isPlaying ? ['4px', '14px', '6px'] : '4px',
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.6,
                    delay: i * 0.15,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Title & Artist */}
        <div className="flex flex-col max-w-[150px] overflow-hidden">
          <span className="text-xs font-semibold truncate text-white tracking-wide">
            {media.title}
          </span>
          <span className="text-[11px] text-neutral-400 truncate">
            {media.artist}
          </span>
        </div>
      </div>

      {/* Right: Controls & Equalizer Wave */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevious}
          className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-95"
          title="Previous"
        >
          <SkipBack className="w-4 h-4 fill-current" />
        </button>

        <button
          onClick={onPlayPause}
          className="p-2 bg-white text-black hover:bg-neutral-200 transition-colors rounded-full shadow-lg active:scale-95 flex items-center justify-center"
          title={media.isPlaying ? 'Pause' : 'Play'}
        >
          {media.isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <button
          onClick={onNext}
          className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-95"
          title="Next"
        >
          <SkipForward className="w-4 h-4 fill-current" />
        </button>
      </div>
    </motion.div>
  )
}
