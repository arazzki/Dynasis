import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type IslandMode = 'idle' | 'media' | 'shelf' | 'battery' | 'menu'

interface IslandProps {
  mode: IslandMode
  isHovered: boolean
  isAutoHide?: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onMouseDown?: (e: React.MouseEvent) => void
  children: React.ReactNode
}

const modeDimensions: Record<IslandMode, { width: number; height: number; borderRadius: number }> = {
  idle: { width: 200, height: 36, borderRadius: 20 },
  battery: { width: 240, height: 44, borderRadius: 24 },
  media: { width: 430, height: 86, borderRadius: 28 },
  shelf: { width: 470, height: 96, borderRadius: 28 },
  menu: { width: 370, height: 138, borderRadius: 28 },
}

export const Island: React.FC<IslandProps> = ({
  mode,
  isHovered,
  isAutoHide = false,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onContextMenu,
  onMouseDown,
  children,
}) => {
  const currentDim = modeDimensions[mode]
  const targetWidth = isHovered && mode === 'idle' ? 228 : currentDim.width
  const targetHeight = isHovered && mode === 'idle' ? 38 : currentDim.height
  const targetY = isAutoHide && !isHovered && mode === 'idle' ? -18 : 0

  return (
    <div className="w-full flex justify-center pt-1.5">
      <motion.div
        layout
        initial={false}
        animate={{
          width: targetWidth,
          height: targetHeight,
          borderRadius: currentDim.borderRadius,
          y: targetY,
        }}
        transition={{
          type: 'spring',
          stiffness: 460,
          damping: 30,
          mass: 0.8,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
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
