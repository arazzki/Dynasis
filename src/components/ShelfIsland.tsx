import React, { useState } from 'react'
import {
  Copy,
  Download,
  Trash2,
  Check,
  Move,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Camera,
  FileText,
} from 'lucide-react'

export interface ScreenshotItem {
  id: string
  type?: 'image' | 'file'
  filePath?: string
  /** Small preview only (full-resolution image lives on disk at filePath). */
  dataUrl?: string
  timestamp: number
  size?: { width: number; height: number }
  name?: string
}

interface ShelfIslandProps {
  items: ScreenshotItem[]
  onDismiss: (id: string) => void
  onClearAll?: () => void
  onCopy: (item: ScreenshotItem) => void
  onSave: (item: ScreenshotItem) => void
  onSimulateScreenshot?: () => void
  onOutboundDragStart?: () => void
}

export const ShelfIsland: React.FC<ShelfIslandProps> = ({
  items,
  onDismiss,
  onClearAll,
  onCopy,
  onSave,
  onSimulateScreenshot,
  onOutboundDragStart,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  if (items.length === 0) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex items-center justify-between w-full h-full px-5 py-3 rounded-[18px] bg-[#141518] border border-dashed border-white/15 text-white overflow-hidden"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12.5px] font-semibold text-[#f5f6f8]">
              Screenshot & Drop Shelf
            </span>
            <span className="text-[11px] text-[#9398a1] mt-0.5">
              Otomatis menyimpan <kbd className="px-1 py-0.5 text-[10px] bg-white/10 rounded">Win+Shift+S</kbd> / gambar yang di-copy, & File Drop.
            </span>
          </div>
        </div>

        {onSimulateScreenshot && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSimulateScreenshot()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-medium text-[#f5f6f8] border border-white/10 transition-all active:scale-95 flex-shrink-0"
          >
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span>Sample Capture</span>
          </button>
        )}
      </div>
    )
  }

  const validIndex = Math.min(currentIndex, Math.max(0, items.length - 1))
  const currentItem = items[validIndex]

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCopy(currentItem)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (currentItem.filePath && window.dynasis?.startFileDrag) {
      e.preventDefault()
      onOutboundDragStart?.()
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

  const isImage =
    !currentItem.name ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(currentItem.name) ||
    Boolean(currentItem.dataUrl?.startsWith('data:image')) ||
    Boolean(currentItem.dataUrl?.startsWith('http'))

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative flex items-center justify-between w-full h-full px-4 py-3 rounded-[18px] bg-[#141518] border border-white/[0.05] text-white overflow-hidden"
    >
      {/* Ambient blue radial wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(240px 180px at 20% 110%, rgba(59, 130, 246, 0.4) 0%, transparent 70%)',
        }}
      />

      {/* Left: Thumbnail + Details */}
      <div className="relative z-10 flex items-center gap-3.5 min-w-0 flex-1 pr-2">
        <div
          draggable={Boolean(currentItem.filePath)}
          onDragStart={handleDragStart}
          className="relative w-20 h-14 rounded-xl overflow-hidden bg-[#0e0f11] border border-white/15 shadow-md group cursor-grab active:cursor-grabbing flex-shrink-0 flex items-center justify-center"
          title="Drag keluar ke WhatsApp, Discord, Explorer, atau aplikasi lain"
        >
          {isImage && currentItem.dataUrl ? (
            <img
              src={currentItem.dataUrl}
              alt="Preview"
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <FileText className="w-6 h-6 text-blue-400" />
          )}
          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Move className="w-4 h-4 text-white drop-shadow" />
          </div>
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <span className="text-[12px] font-semibold text-[#f5f6f8] truncate">
              {currentItem.name || `Item #${items.length - validIndex}`}
            </span>
          </div>
          <span className="text-[11px] text-[#9398a1] flex items-center gap-1 mt-0.5">
            <Move className="w-3 h-3 text-blue-400 flex-shrink-0" />
            <span>Tarik gambar keluar atau klik Copy</span>
          </span>
          {currentItem.size && (
            <span className="text-[10px] text-[#6b7079] mt-0.5 font-mono">
              {currentItem.size.width} × {currentItem.size.height} px
            </span>
          )}
        </div>
      </div>

      {/* Center: Multi-item pagination */}
      {items.length > 1 && (
        <div className="relative z-10 flex items-center gap-1 bg-white/[0.06] rounded-full px-1.5 py-0.5 border border-white/10 flex-shrink-0 mr-2">
          <button
            onClick={handlePrev}
            className="p-1 hover:bg-white/10 rounded-full text-neutral-300 hover:text-white"
            title="Item sebelumnya"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10.5px] font-mono text-[#f5f6f8] px-1 tabular-nums">
            {validIndex + 1}/{items.length}
          </span>
          <button
            onClick={handleNext}
            className="p-1 hover:bg-white/10 rounded-full text-neutral-300 hover:text-white"
            title="Item berikutnya"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Right: Actions */}
      <div className="relative z-10 flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f6f8] text-[#0b0c0e] hover:bg-white active:scale-95 transition-all text-[11.5px] rounded-full font-semibold shadow"
          title="Salin kembali ke Clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onSave(currentItem)
          }}
          className="p-2 bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 transition-all rounded-full text-[#f5f6f8] border border-white/10"
          title="Simpan sebagai file PNG"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(currentItem.id)
          }}
          className="p-2 bg-white/[0.08] hover:bg-red-500/25 hover:text-red-400 active:scale-95 transition-all rounded-full text-[#9398a1] border border-white/10"
          title="Hapus dari Shelf"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {items.length > 1 && onClearAll && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClearAll()
            }}
            className="px-2 py-1 text-[10px] text-[#9398a1] hover:text-red-400 transition-colors"
            title="Bersihkan semua"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
