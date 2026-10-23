import React from 'react'
import { motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

interface PlayingBarsProps {
  /** Smaller variant used inside the compact pill. */
  compact?: boolean
  /** Tiny variant used by the 5px stealth wake strip. */
  mini?: boolean
  className?: string
}

/**
 * Per-bar keyframes. Each bar runs its own phase so the group reads as an
 * organic iOS-style waveform instead of a mechanical metronome.
 */
const SHAPES = [
  [0.3, 1, 0.5, 0.85, 0.35],
  [0.45, 0.8, 0.3, 0.65, 0.5],
  [0.25, 0.9, 0.6, 1, 0.4],
  [0.4, 0.7, 0.35, 0.9, 0.5],
]

const TIMING = [
  { duration: 0.72, delay: 0 },
  { duration: 0.9, delay: 0.09 },
  { duration: 0.62, delay: 0.18 },
  { duration: 0.84, delay: 0.05 },
]

/** Static frame used when the OS asks for reduced motion. */
const STILL = [0.6, 0.85, 0.5, 0.75]

/**
 * Equalizer bars for the "now playing" indicator.
 *
 * Bars have a fixed height and animate `scaleY` (transform-only) instead of
 * `height`, so every frame is composited by the GPU and no layout is
 * recalculated while music plays. The blurred glow behind the group is static
 * for the same reason.
 */
export const PlayingBars: React.FC<PlayingBarsProps> = ({
  compact = false,
  mini = false,
  className = '',
}) => {
  const reducedMotion = usePrefersReducedMotion()

  const barWidth = mini ? 2 : compact ? 2.5 : 3
  const barHeight = mini ? 4 : compact ? 12 : 14
  const gap = mini ? 'gap-[1.5px]' : compact ? 'gap-[2px]' : 'gap-[2.5px] px-1'

  return (
    <div
      aria-hidden="true"
      className={`relative flex items-end ${gap} ${className}`}
      style={{ height: barHeight }}
    >
      {!mini && (
        <span className="pointer-events-none absolute -inset-x-1 bottom-0 top-1/2 rounded-full bg-emerald-400/25 blur-[4px]" />
      )}
      {SHAPES.map((shape, i) => (
        <motion.span
          key={i}
          className={
            mini
              ? 'relative origin-bottom rounded-full bg-emerald-400/85'
              : 'relative origin-bottom rounded-full bg-gradient-to-t from-emerald-500 via-emerald-400 to-emerald-200'
          }
          style={{ width: barWidth, height: barHeight }}
          animate={{ scaleY: reducedMotion ? STILL[i] : shape }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  repeat: Infinity,
                  repeatType: 'mirror',
                  duration: TIMING[i].duration,
                  delay: TIMING[i].delay,
                  ease: 'easeInOut',
                }
          }
        />
      ))}
    </div>
  )
}
