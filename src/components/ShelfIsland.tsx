import React, { useState } from 'react'
import { Copy, Download, X, Check, Move } from 'lucide-react'
import { motion } from 'framer-motion'

export interface ScreenshotItem {
  id: string
  filePath?: string
  dataUrl: string
  timestamp: number
  size?: { width: number; height: number }
}

interface ShelfIslandProps {
  screenshot: ScreenshotItem
  onDismiss: () => void
  onCopy: () => void
  onSave: () => void
}

export const ShelfIsland: React.FC<ShelfIslandProps> = ({
  screenshot,
  onDismiss,
  onCopy,
  onSave,
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (screenshot.filePath && window.dynasis?.startFileDrag) {
      e.preventDefault()
      window.dynasis.startFileDrag(screenshot.filePath)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
      className="flex items-center justify-between w-full h-full px-4 text-white"
    >
      {/* Left: Draggable Thumbnail */}
      <div className="flex items-center gap-3">
        <div
          draggable={!!screenshot.filePath}
          onDragStart={handleDragStart}
          className="relative w-16 h-12 rounded-lg overflow-hidden bg-neutral-900 border border-white/20 shadow-md group cursor-grab active:cursor-grabbing flex-shrink-0"
          title="Drag this screenshot to any app (WhatsApp, Discord, Figma, etc.)"
        >
          <img
            src={screenshot.dataUrl}
            alt="Screenshot preview"
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Move className="w-4 h-4 text-white drop-shadow" />
          </div>
        </div>

        {/* Info & Drag hint */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-white tracking-wide">
              Screenshot Captured
            </span>
          </div>
          <span className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
            <Move className="w-2.5 h-2.5 text-neutral-500" />
            Drag thumbnail into any app
          </span>
        </div>
      </div>

      {/* Right: Quick Action Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-xs rounded-full font-medium text-white border border-white/10"
          title="Copy Image to Clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-neutral-300" />
              <span>Copy</span>
            </>
          )}
        </button>

        <button
          onClick={onSave}
          className="p-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full text-neutral-300 hover:text-white border border-white/10"
          title="Save to folder"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onDismiss}
          className="p-1.5 bg-white/10 hover:bg-red-500/30 hover:text-red-400 active:scale-95 transition-all rounded-full text-neutral-400 border border-white/10 ml-0.5"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  )
}
