/// <reference types="vite/client" />
import type { FritterzingApi } from '../../preload/index'

declare global {
  interface Window {
    fritterzing?: FritterzingApi
  }
}
