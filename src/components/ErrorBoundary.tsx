import React from 'react'
import { AlertTriangle, RotateCcw, Power } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-resort UI for renderer crashes.
 *
 * Without this, a single render/lifecycle exception unmounts the React tree and
 * leaves the frameless island window completely blank, which looks like the app
 * silently died and gives the user no way to recover.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Dynasis] renderer crashed:', error, info.componentStack)

    // App's `Island` component owns the click-through hit-box. When it never
    // mounts (crash during render), the hit-box stays at the 200x6 wake strip
    // and the fallback buttons would be unclickable. Expand it to the window.
    try {
      window.dynasis?.setIslandRect(0, 0, window.innerWidth, window.innerHeight)
    } catch {
      // Non-fatal: the window is already broken at this point.
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="w-full h-full flex items-start justify-center px-3 pt-2 pointer-events-auto select-none">
        <div
          role="alert"
          className="w-full max-w-[540px] rounded-[18px] bg-[#141518] border border-red-500/35 px-4 py-3 text-[#f5f6f8] shadow-[0_18px_40px_-10px_rgba(0,0,0,0.9)]"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-[12.5px] font-semibold">Dynasis berhenti karena error</span>
          </div>

          <p className="mt-1 text-[11px] leading-snug text-[#9398a1]">
            Tampilan gagal dirender. Klik Muat Ulang untuk memulihkan Dynasis tanpa kehilangan
            proses lain yang sedang berjalan.
          </p>

          <pre className="mt-2 max-h-[72px] overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[10px] leading-snug text-red-300 whitespace-pre-wrap break-all">
            {error.message || String(error)}
          </pre>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 rounded-full bg-[#f5f6f8] px-3 py-1.5 text-[11.5px] font-semibold text-[#0b0c0e] transition-all hover:bg-white active:scale-95"
              title="Muat ulang tampilan Dynasis"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </button>

            <button
              onClick={() => window.dynasis?.closeApp?.()}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11.5px] font-medium text-[#f5f6f8] transition-all hover:bg-white/[0.15] active:scale-95"
              title="Tutup Dynasis"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Tutup</span>
            </button>
          </div>
        </div>
      </div>
    )
  }
}
