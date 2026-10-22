import type { DevPilotApi } from '@shared/types/api'

declare global {
  interface Window {
    devPilot: DevPilotApi
  }
}

export {}
