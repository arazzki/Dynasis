import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Tracks the OS "reduce motion" setting (Windows: Settings > Accessibility >
 * Visual effects > Animation effects). Chromium surfaces it through
 * `prefers-reduced-motion`, so all framer-motion loops in Dynasis can fall
 * back to a static frame instead of animating forever.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia(QUERY).matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    let media: MediaQueryList
    try {
      media = window.matchMedia(QUERY)
    } catch {
      return
    }

    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reduced
}
