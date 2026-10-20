import React, { useEffect } from 'react'
import { motion } from 'framer-motion'

export type IslandState = 'hidden' | 'compact' | 'expanded' | 'battery'
export type NotchStyle = 'notch' | 'pill'

interface IslandProps {
  state: IslandState
  isHovered: boolean
  notchStyle?: NotchStyle
  countdownFraction?: number | null
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onMouseDown?: (e: React.MouseEvent) => void
  children: React.ReactNode
}

const PANEL_W = 680

export function getIslandDimensions(
  state: IslandState,
  isHovered: boolean,
  notchStyle: NotchStyle
): { width: number; height: number; y: number; borderRadius: string } {
  const isPill = notchStyle === 'pill'
  switch (state) {
    case 'hidden':
      return {
        width: 184,
        height: 5,
        y: 0,
        borderRadius: '0px 0px 10px 10px',
      }
    case 'compact':
      return {
        width: isHovered ? 312 : 288,
        height: isHovered ? 36 : 34,
        y: isPill ? 6 : 0,
        borderRadius: isPill ? '20px' : '0px 0px 16px 16px',
      }
    case 'battery':
      return {
        width: 296,
        height: 44,
        y: isPill ? 6 : 0,
        borderRadius: isPill ? '22px' : '0px 0px 18px 18px',
      }
    case 'expanded':
      return {
        width: 580,
        height: 192,
        y: isPill ? 6 : 0,
        borderRadius: isPill ? '26px' : '0px 0px 24px 24px',
      }
  }
}

export const Island: React.FC<IslandProps> = ({
  state,
  isHovered,
  notchStyle = 'notch',
  countdownFraction = null,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onContextMenu,
  onMouseDown,
  children,
}) => {
  const dim = getIslandDimensions(state, isHovered, notchStyle)

  // Synchronize exact hit-test rectangle with Electron main process (coucou pattern)
  useEffect(() => {
    const viewportW = window.innerWidth > 0 ? window.innerWidth : PANEL_W
    if (state === 'hidden') {
      // Strictly 200x6 top-center wake strip intercepts mouse in Stealth Edge mode
      window.dynasis?.setIslandRect((viewportW - 200) / 2, 0, 200, 6)
    } else {
      window.dynasis?.setIslandRect(
        (viewportW - dim.width) / 2,
        dim.y,
        dim.width,
        dim.height
      )
    }
  }, [state, dim.width, dim.height, dim.y])

  const isShrinking = state === 'hidden' || state === 'compact'

  return (
    <div className="w-full h-full flex justify-center items-start pointer-events-none">
      <motion.div
        initial={false}
        animate={{
          width: dim.width,
          height: dim.height,
          y: dim.y,
          borderRadius: dim.borderRadius,
        }}
        transition={
          isShrinking
            ? {
                duration: 0.32,
                ease: [0.45, 0, 0.2, 1],
              }
            : {
                type: 'spring',
                stiffness: 420,
                damping: 29,
                mass: 0.85,
              }
        }
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        className="pointer-events-auto relative bg-black text-[#f5f6f8] overflow-hidden select-none border border-white/[0.11] flex flex-col justify-between"
        style={{
          boxShadow:
            state === 'hidden'
              ? '0 2px 10px rgba(34, 197, 94, 0.25)'
              : '0 18px 40px -10px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {children}

        {/* Coucou-style Auto-Collapse Countdown Bar at the bottom center */}
        {state === 'expanded' &&
          countdownFraction !== null &&
          countdownFraction > 0 && (
            <div
              className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full bg-white/35 transition-[width] duration-100"
              style={{ width: `${Math.round(countdownFraction * 160)}px` }}
            />
          )}
      </motion.div>
    </div>
  )
}
