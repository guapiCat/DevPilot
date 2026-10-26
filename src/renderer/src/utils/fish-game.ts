export const FISH_HITS_TO_WIN = 3
export const FISH_MIN_JUMP_DISTANCE = 140

export interface FishPoint {
  x: number
  y: number
}

export interface FishBounds {
  viewportWidth: number
  viewportHeight: number
  fishSize: number
  margin?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function distance(a: FishPoint, b: FishPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function boundsRange(bounds: FishBounds): { min: number; maxX: number; maxY: number } {
  const margin = bounds.margin ?? 16
  return {
    min: margin,
    maxX: Math.max(margin, bounds.viewportWidth - bounds.fishSize - margin),
    maxY: Math.max(margin, bounds.viewportHeight - bounds.fishSize - margin)
  }
}

export function clampFishPosition(point: FishPoint, bounds: FishBounds): FishPoint {
  const { min, maxX, maxY } = boundsRange(bounds)
  return { x: clamp(point.x, min, maxX), y: clamp(point.y, min, maxY) }
}

export function pickFishJump(
  bounds: FishBounds,
  avoid: readonly FishPoint[] = [],
  random: () => number = Math.random
): FishPoint {
  const { min, maxX, maxY } = boundsRange(bounds)
  let candidate: FishPoint = { x: min, y: min }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    candidate = {
      x: min + random() * (maxX - min),
      y: min + random() * (maxY - min)
    }
    if (avoid.every((point) => distance(candidate, point) >= FISH_MIN_JUMP_DISTANCE)) {
      return candidate
    }
  }

  return candidate
}
