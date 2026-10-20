import type { DynasisAPI } from '../../electron/preload'

declare global {
  interface Window {
    dynasis: DynasisAPI
  }
}

export {}
