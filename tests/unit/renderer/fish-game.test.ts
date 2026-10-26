import { describe, expect, it } from 'vitest'
import { clampFishPosition, FISH_MIN_JUMP_DISTANCE, pickFishJump } from '@renderer/utils/fish-game'

const bounds = { viewportWidth: 1000, viewportHeight: 800, fishSize: 84, margin: 16 }

function sequence(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    return value ?? 0
  }
}

describe('clampFishPosition', () => {
  it('把越界坐标限制在视口边距内', () => {
    expect(clampFishPosition({ x: -50, y: -20 }, bounds)).toEqual({ x: 16, y: 16 })
    expect(clampFishPosition({ x: 5000, y: 5000 }, bounds)).toEqual({ x: 900, y: 700 })
  })

  it('视口小于鱼身时退回边距', () => {
    const tiny = { viewportWidth: 40, viewportHeight: 40, fishSize: 84, margin: 16 }
    expect(clampFishPosition({ x: 10, y: 10 }, tiny)).toEqual({ x: 16, y: 16 })
  })
})

describe('pickFishJump', () => {
  it('落点始终在视口内', () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const point = pickFishJump(bounds, [], () => value)
      expect(point.x).toBeGreaterThanOrEqual(16)
      expect(point.x).toBeLessThanOrEqual(900)
      expect(point.y).toBeGreaterThanOrEqual(16)
      expect(point.y).toBeLessThanOrEqual(700)
    }
  })

  it('避开与上一次位置过近的落点', () => {
    const previous = { x: 458, y: 358 }
    const point = pickFishJump(bounds, [previous], sequence([0.5, 0.5, 0.5, 0.1]))

    expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeGreaterThanOrEqual(
      FISH_MIN_JUMP_DISTANCE
    )
  })
})
