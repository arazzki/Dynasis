import React, { useState } from 'react'
import { Copy, Download, Trash2, Check, Move, ChevronLeft, ChevronRight, ChevronUp, LayoutGrid } from 'lucide-react'
import { motion } from 'framer-motion'

export interface ScreenshotItem {
  id: string
  filePath?: string
  dataUrl: string
  timestamp: number
  size?: { width: number; height: number }
  name?: string
}

interface ShelfIslandProps {
  items: ScreenshotItem[]
  onDismiss: (id: string) => void
  onCopy: (item: ScreenshotItem) => void
  onSave: (item: ScreenshotItem) => void
  onCollapse?: () => void
  onOpenMenu?: () => void
}

export const ShelfIsland: React.FC<ShelfIslandProps> = ({
  items,
  onDismiss,
  onCopy,
  onSave,
  onCollapse,
  onOpenMenu,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  const validIndex = Math.min(currentIndex, Math.max(0, items.length - 1))
  const currentItem = items[validIndex]

  if (!currentItem) return null

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCopy(currentItem)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (currentItem.filePath && window.dynasis?.startFileDrag) {
      e.preventDefault()
      window.dynasis.startFileDrag(currentItem.filePath)
    }
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center justify-between w-full h-full px-4 text-white"
    >
      {/* Left: Thumbnail & Draggable Area */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          draggable={!!currentItem.filePath}
          onDragStart={handleDragStart}
          className="relative w-16 h-12 rounded-lg overflow-hidden bg-neutral-900 border border-white/20 shadow-md group cursor-grab active:cursor-grabbing flex-shrink-0"
          title="Drag this screenshot to any app (WhatsApp, Discord, Figma, etc.)"
        >
          <img
            src={currentItem.dataUrl}
            alt="Screenshot preview"
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Move className="w-4 h-4 text-white drop-shadow" />
          </div>
        </div>

        {/* Info & Shelf counter */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-white tracking-wide truncate">
              {currentItem.name || (items.length > 1 ? `Shelf (${validIndex + 1}/${items.length})` : 'Screenshot Ready')}
            </span>
          </div>
          <span className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
            <Move className="w-2.5 h-2.5 text-neutral-500 flex-shrink-0" />
            Drag out or copy
          </span>
        </div>
      </div>

      {/* Center: Pagination controls if multiple items */}
      {items.length > 1 && (
        <div className="flex items-center gap-0.5 bg-white/5 rounded-full px-1 py-0.5 border border-white/10 flex-shrink-0">
          <button
            onClick={handlePrev}
            className="p-1 hover:bg-white/10 rounded-full text-neutral-300 hover:text-white"
            title="Previous item"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-mono text-neutral-300 px-0.5">
            {validIndex + 1}/{items.length}
          </span>
          <button
            onClick={handleNext}
            className="p-1 hover:bg-white/10 rounded-full text-neutral-300 hover:text-white"
            title="Next item"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Right: Quick Action Buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-xs rounded-full font-medium text-white border border-white/10"
          title="Copy Image to Clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-neutral-300" />
              <span>Copy</span>
            </>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onSave(currentItem)
          }}
          className="p-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full text-neutral-300 hover:text-white border border-white/10"
          title="Save image to file"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(currentItem.id)
          }}
          className="p-1.5 bg-white/10 hover:bg-red-500/30 hover:text-red-400 active:scale-95 transition-all rounded-full text-neutral-400 border border-white/10"
          title="Remove item from shelf"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {onOpenMenu && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenMenu()
            }}
            className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
            title="Open Quick Controls"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        )}

        {onCollapse && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCollapse()
            }}
            className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
            title="Keep in Shelf & Minimize to Pill"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  )
}
