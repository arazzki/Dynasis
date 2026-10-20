import React from 'react'
import { Zap, BatteryCharging, Battery } from 'lucide-react'
import { motion } from 'framer-motion'

export interface BatteryState {
  level: number // 0 to 100
  isCharging: boolean
}

interface BatteryHUDProps {
  battery: BatteryState
}

export const BatteryHUD: React.FC<BatteryHUDProps> = ({ battery }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="flex items-center justify-between w-full h-full px-5 text-white"
    >
      <div className="flex items-center gap-2.5">
        <div className="relative flex items-center justify-center text-emerald-400">
          {battery.isCharging ? (
            <BatteryCharging className="w-5 h-5 text-emerald-400 animate-pulse" />
          ) : (
            <Battery className="w-5 h-5 text-neutral-300" />
          )}
        </div>
        <span className="text-xs font-medium text-neutral-300">
          {battery.isCharging ? 'Charging' : 'Battery'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-white tracking-wider">
          {battery.level}%
        </span>
        {battery.isCharging && <Zap className="w-3.5 h-3.5 text-emerald-400 fill-current" />}
      </div>
    </motion.div>
  )
}
