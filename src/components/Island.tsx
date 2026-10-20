import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type IslandMode = 'idle' | 'media' | 'shelf' | 'battery' | 'menu'

interface IslandProps {
  mode: IslandMode
  isHovered: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClick: () => void
  children: React.ReactNode
}

const modeDimensions: Record<IslandMode, { width: number; height: number; borderRadius: number }> = {
  idle: { width: 140, height: 32, borderRadius: 20 },
  battery: { width: 230, height: 42, borderRadius: 24 },
  media: { width: 400, height: 78, borderRadius: 28 },
  shelf: { width: 440, height: 82, borderRadius: 28 },
  menu: { width: 340, height: 100, borderRadius: 28 },
}

export const Island: React.FC<IslandProps> = ({
  mode,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  children,
}) => {
  const currentDim = modeDimensions[mode]
  const targetWidth = isHovered && mode === 'idle' ? 175 : currentDim.width
  const targetHeight = isHovered && mode === 'idle' ? 36 : currentDim.height

  return (
    <div className="w-full flex justify-center pt-2">
      <motion.div
        layout
        initial={false}
        animate={{
          width: targetWidth,
          height: targetHeight,
          borderRadius: currentDim.borderRadius,
        }}
        transition={{
          type: 'spring',
          stiffness: 480,
          damping: 32,
          mass: 0.8,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        className="relative bg-black text-white overflow-hidden shadow-island cursor-pointer select-none border border-white/10 flex items-center justify-center backdrop-blur-xl"
        style={{
          boxShadow: '0 16px 36px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.12)',
        }}
      >
        <AnimatePresence mode="wait">
          {children}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
