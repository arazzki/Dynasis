import React from 'react'
import { motion } from 'framer-motion'

interface PlayingBarsProps {
  /** Smaller variant used inside the compact pill. */
  compact?: boolean
  className?: string
}

const FRAMES = ['3px', '11px', '4px', '9px', '3px']

/**
 * Equalizer bars for the "now playing" indicator.
 *
 * Shared by the compact pill and the media card so both animate identically.
 * Only `height` is animated, which keeps the work on the GPU-friendly path
 * used before while staying in sync between the two surfaces.
 */
export const PlayingBars: React.FC<PlayingBarsProps> = ({ compact = false, className = '' }) => (
  <div
    aria-hidden="true"
    className={`flex items-end gap-[2px] ${compact ? 'h-3' : 'h-3.5 px-1'} ${className}`}
  >
    {[0, 1, 2, 3].map((i) => (
      <motion.span
        key={i}
        className={`${compact ? 'w-[2.2px]' : 'w-[2.5px]'} bg-emerald-400 rounded-full`}
        animate={{ height: FRAMES }}
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
