<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import maidUrl from '@renderer/assets/deepseek-maid.png'
import {
  clampFishPosition,
  FISH_HITS_TO_WIN,
  pickFishJump,
  type FishBounds,
  type FishPoint,
} from '@renderer/utils/fish-game'

type GameMode = 'idle' | 'playing' | 'celebrating'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  size: number
  color: string
}

interface Flash {
  x: number
  y: number
  life: number
  color: string
}

const IDLE_SIZE = 96
const PLAY_SIZE = 144
const HIT_LOCK_MS = 180
const SIDEBAR_WIDTH = 208
const CELEBRATE_DURATION = 4200
const TAU = Math.PI * 2
const FIREWORKS_COLORS = ['#5cc8ff', '#4f8cff', '#ffd166', '#ff7eb6', '#9b8cff', '#4ade80']
const BURST_POINTS: Array<[number, number]> = [
  [0.28, 0.34],
  [0.5, 0.22],
  [0.72, 0.32],
  [0.38, 0.48],
  [0.62, 0.52],
  [0.82, 0.58],
]

const mode = ref<GameMode>('idle')
const hits = ref(0)
const facing = ref<1 | -1>(1)
const fish = ref<FishPoint>({ x: 0, y: 0 })
const homePoint = ref<FishPoint>({ x: 0, y: 0 })
const showPlus = ref(false)
const plusId = ref(0)
const isDragging = ref(false)

const fishBody = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)

const fishStyle = computed(() => ({
  transform: `translate3d(${Math.round(fish.value.x)}px, ${Math.round(fish.value.y)}px, 0)`,
}))
const ariaLabel = computed(() => {
  if (mode.value === 'idle') return '摸鱼小游戏：拖动 DeepSeek 娘可移动位置，双击开始'
  if (mode.value === 'playing') {
    return `打地鼠进行中，已命中 ${hits.value} 次，共 ${FISH_HITS_TO_WIN} 次`
  }
  return '摸鱼成功'
})

interface DragOrigin {
  pointerX: number
  pointerY: number
  fishX: number
  fishY: number
}

let jumpTimer: number | undefined
let plusTimer: number | undefined
let winTimer: number | undefined
let dragOrigin: DragOrigin | null = null
let dragMoved = false
let homeCustomized = false
let suppressDblClickUntil = 0
let lastHitAt = 0
let rafId = 0
let context: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let flashes: Flash[] = []
let burstTimers: number[] = []
let reducedMotion = false

function viewportBounds(size: number): FishBounds {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    fishSize: size,
    margin: 16,
  }
}

function restingPoint(size: number): FishPoint {
  const sidebar = document.querySelector<HTMLElement>('.sidebar')
  const rect = sidebar?.getBoundingClientRect()
  const left = rect?.left ?? 0
  const width = rect?.width ?? SIDEBAR_WIDTH
  return clampFishPosition({ x: left + (width - size) / 2, y: window.innerHeight - size - 64 }, viewportBounds(size))
}

function onPointerDown(event: PointerEvent): void {
  if (mode.value !== 'idle' || event.button !== 0) return
  dragOrigin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    fishX: fish.value.x,
    fishY: fish.value.y,
  }
  dragMoved = false
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragOrigin) return
  const dx = event.clientX - dragOrigin.pointerX
  const dy = event.clientY - dragOrigin.pointerY
  if (!dragMoved && Math.hypot(dx, dy) < 4) return

  dragMoved = true
  isDragging.value = true
  fish.value = clampFishPosition({ x: dragOrigin.fishX + dx, y: dragOrigin.fishY + dy }, viewportBounds(IDLE_SIZE))
}

function finishDrag(event: PointerEvent): void {
  if (!dragOrigin) return
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }
  if (dragMoved) {
    homePoint.value = clampFishPosition(fish.value, viewportBounds(IDLE_SIZE))
    fish.value = homePoint.value
    homeCustomized = true
    suppressDblClickUntil = performance.now() + 400
  }
  dragOrigin = null
  dragMoved = false
  isDragging.value = false
}

function scheduleJump(delay?: number): void {
  window.clearTimeout(jumpTimer)
  const wait = delay ?? 700 + Math.random() * 500
  jumpTimer = window.setTimeout(() => {
    if (mode.value !== 'playing') return
    const target = pickFishJump(viewportBounds(PLAY_SIZE), [fish.value])
    if (Math.abs(target.x - fish.value.x) > 8) {
      facing.value = target.x < fish.value.x ? 1 : -1
    }
    fish.value = target
    scheduleJump()
  }, wait)
}

function startGame(): void {
  if (mode.value !== 'idle' || performance.now() < suppressDblClickUntil) return
  mode.value = 'playing'
  hits.value = 0
  showPlus.value = false
  facing.value = 1
  lastHitAt = 0
  fish.value = clampFishPosition(fish.value, viewportBounds(PLAY_SIZE))
  scheduleJump(620)
}

function onFishClick(event: MouseEvent): void {
  if (mode.value !== 'playing') return
  event.stopPropagation()

  const now = performance.now()
  if (now - lastHitAt < HIT_LOCK_MS) return
  lastHitAt = now

  hits.value += 1
  plusId.value += 1
  showPlus.value = true
  window.clearTimeout(plusTimer)
  plusTimer = window.setTimeout(() => {
    showPlus.value = false
  }, 520)

  fishBody.value?.animate?.(
    [
      { transform: 'scale(1.14, 0.84) rotate(-3deg)' },
      { transform: 'scale(0.95, 1.07) rotate(2deg)' },
      { transform: 'scale(1, 1) rotate(0deg)' },
    ],
    { duration: 320, easing: 'cubic-bezier(0.3, 0.9, 0.4, 1)' },
  )

  if (hits.value >= FISH_HITS_TO_WIN) {
    celebrate()
    return
  }

  scheduleJump(HIT_LOCK_MS)
}

function celebrate(): void {
  window.clearTimeout(jumpTimer)
  mode.value = 'celebrating'
  hits.value = FISH_HITS_TO_WIN
  startFireworks()
  winTimer = window.setTimeout(stopGame, CELEBRATE_DURATION)
}

function stopGame(): void {
  if (mode.value === 'idle') return
  window.clearTimeout(jumpTimer)
  window.clearTimeout(plusTimer)
  window.clearTimeout(winTimer)
  mode.value = 'idle'
  hits.value = 0
  showPlus.value = false
  stopFireworks()
  if (!homeCustomized) {
    homePoint.value = restingPoint(IDLE_SIZE)
  }
  fish.value = clampFishPosition(homePoint.value, viewportBounds(IDLE_SIZE))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mode.value !== 'idle') {
    event.preventDefault()
    stopGame()
  }
}

function onDragStart(event: DragEvent): void {
  if (!dragOrigin) return
  // 拖动角色时下方可能露出 <img>，浏览器会改判为原生图片拖拽并取消 pointer capture。
  event.preventDefault()
  event.stopPropagation()
}

function onResize(): void {
  if (mode.value === 'celebrating') {
    resizeCanvas()
    return
  }
  if (mode.value === 'idle') {
    if (!homeCustomized) {
      homePoint.value = restingPoint(IDLE_SIZE)
    }
    fish.value = clampFishPosition(homePoint.value, viewportBounds(IDLE_SIZE))
    return
  }
  fish.value = clampFishPosition(fish.value, viewportBounds(PLAY_SIZE))
}

function resizeCanvas(): void {
  const element = canvas.value
  if (!element) return
  const dpr = window.devicePixelRatio || 1
  element.width = Math.floor(window.innerWidth * dpr)
  element.height = Math.floor(window.innerHeight * dpr)
  context = element.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function spawnBurst(x: number, y: number, count = 52): void {
  const color = FIREWORKS_COLORS[Math.floor(Math.random() * FIREWORKS_COLORS.length)]
  flashes.push({ x, y, life: 1, color })
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * TAU
    const speed = 1.6 + Math.random() * 4.8
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.011 + Math.random() * 0.009,
      size: 1.4 + Math.random() * 1.6,
      color: Math.random() < 0.18 ? '#ffffff' : color,
    })
  }
}

function drawFrame(): void {
  const ctx = context
  if (!ctx) return

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  ctx.globalCompositeOperation = 'lighter'

  for (let index = flashes.length - 1; index >= 0; index -= 1) {
    const flash = flashes[index]
    flash.life -= 0.06
    if (flash.life <= 0) {
      flashes.splice(index, 1)
      continue
    }
    const radius = 18 + (1 - flash.life) * 56
    const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius)
    gradient.addColorStop(0, flash.color)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.globalAlpha = flash.life * 0.45
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(flash.x, flash.y, radius, 0, TAU)
    ctx.fill()
  }

  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index]
    particle.vx *= 0.988
    particle.vy = particle.vy * 0.988 + 0.052
    particle.x += particle.vx
    particle.y += particle.vy
    particle.life -= particle.decay
    if (particle.life <= 0) {
      particles.splice(index, 1)
      continue
    }

    ctx.globalAlpha = Math.min(1, particle.life)
    ctx.strokeStyle = particle.color
    ctx.lineWidth = particle.size
    ctx.beginPath()
    ctx.moveTo(particle.x - particle.vx * 2.4, particle.y - particle.vy * 2.4)
    ctx.lineTo(particle.x, particle.y)
    ctx.stroke()

    ctx.fillStyle = particle.color
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.size * 0.8, 0, TAU)
    ctx.fill()
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function tick(): void {
  drawFrame()
  rafId = requestAnimationFrame(tick)
}

function startFireworks(): void {
  stopFireworks()
  resizeCanvas()
  if (!context) return

  if (reducedMotion) {
    for (const [xRatio, yRatio] of BURST_POINTS.slice(0, 4)) {
      spawnBurst(window.innerWidth * xRatio, window.innerHeight * yRatio, 30)
    }
    drawFrame()
    return
  }

  BURST_POINTS.forEach(([xRatio, yRatio], index) => {
    burstTimers.push(
      window.setTimeout(() => {
        spawnBurst(window.innerWidth * xRatio, window.innerHeight * yRatio)
      }, index * 170),
    )
  })
  rafId = requestAnimationFrame(tick)
}

function stopFireworks(): void {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  burstTimers.forEach((timer) => window.clearTimeout(timer))
  burstTimers = []
  particles = []
  flashes = []
  context?.clearRect(0, 0, window.innerWidth, window.innerHeight)
}

onMounted(() => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  homePoint.value = restingPoint(IDLE_SIZE)
  fish.value = { ...homePoint.value }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  window.addEventListener('dragstart', onDragStart, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('dragstart', onDragStart, true)
  window.clearTimeout(jumpTimer)
  window.clearTimeout(plusTimer)
  window.clearTimeout(winTimer)
  stopFireworks()
})
</script>

<template>
  <Teleport to="body">
    <div class="fish-layer">
      <canvas v-show="mode === 'celebrating'" ref="canvas" class="fireworks" aria-hidden="true"></canvas>

      <button
        type="button"
        class="fish"
        draggable="false"
        title="DeepSeek 娘 · 原图：上善无形（CC BY-NC-SA 4.0）"
        :class="{
          'is-playing': mode === 'playing',
          'is-celebrating': mode === 'celebrating',
          'is-dragging': isDragging,
        }"
        :style="fishStyle"
        :aria-label="ariaLabel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="finishDrag"
        @pointercancel="finishDrag"
        @click.stop="onFishClick"
        @dblclick.stop="startGame">
        <span class="facing" :style="{ transform: `scaleX(${facing})` }">
          <span ref="fishBody" class="fish-body">
            <img class="maid" :src="maidUrl" alt="" draggable="false" />
          </span>
        </span>

        <span v-if="mode === 'idle'" class="hint">双击摸鱼</span>
        <span v-if="showPlus" :key="plusId" class="plus">+1</span>
      </button>

      <div v-if="mode === 'playing'" class="hud" role="status" aria-live="polite">
        <span class="score"
          >打地鼠 <strong>{{ hits }}</strong> / {{ FISH_HITS_TO_WIN }}</span
        >
        <span class="hud-divider"></span>
        <button type="button" class="hud-close" aria-label="结束游戏" @click="stopGame">结束 <kbd>Esc</kbd></button>
      </div>

      <div v-if="mode === 'celebrating'" class="banner">
        <strong>摸鱼成功！</strong>
        <span>三连命中，DeepSeek 娘认输了</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fish-layer {
  position: fixed;
  inset: 0;
  z-index: 1600;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.fireworks {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  animation: fireworks-fade 4.2s ease-out forwards;
}

.fish {
  position: absolute;
  top: 0;
  left: 0;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: grab;
  pointer-events: auto;
  outline: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  will-change: transform;
  transition:
    transform 0.42s cubic-bezier(0.22, 0.85, 0.32, 1),
    width 0.24s ease,
    height 0.24s ease;
}

.fish.is-playing,
.fish.is-celebrating {
  width: 144px;
  height: 144px;
  cursor: crosshair;
}

.fish.is-dragging {
  cursor: grabbing;
  transition: none;
}

.fish.is-dragging .fish-body {
  animation-play-state: paused;
}

.fish:focus-visible {
  border-radius: 50%;
  outline: 2px solid var(--dp-accent);
  outline-offset: 4px;
}

.facing {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: 50% 50%;
  transition: transform 0.18s ease;
}

.fish-body {
  display: block;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 10px 18px rgba(23, 68, 150, 0.28));
  transform-origin: 50% 70%;
  animation: fish-bob 3.4s ease-in-out infinite;
}

.maid {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}

.fish.is-playing .fish-body {
  animation-duration: 1.7s;
}

.fish.is-celebrating .fish-body {
  animation: fish-win 1.1s ease-in-out infinite;
}

.hint {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  padding: 5px 10px;
  transform: translateX(-50%);
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  background: var(--dp-bg-panel);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
  color: var(--dp-text-secondary);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0.92;
  pointer-events: none;
  animation: hint-float 3.4s ease-in-out infinite;
}

.plus {
  position: absolute;
  top: -8px;
  right: -6px;
  color: #ff5c93;
  font-size: 17px;
  font-weight: 700;
  text-shadow: 0 2px 8px rgba(255, 92, 147, 0.45);
  pointer-events: none;
  animation: plus-float 0.52s ease-out forwards;
}

.hud {
  position: absolute;
  top: 14px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 14px;
  transform: translateX(-50%);
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  background: var(--dp-bg-panel);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
  color: var(--dp-text-secondary);
  font-size: 12px;
  pointer-events: auto;
  animation: hud-in 0.22s ease-out;
}

.score strong {
  color: var(--dp-accent-text);
  font-size: 14px;
}

.hud-divider {
  width: 1px;
  height: 14px;
  background: var(--dp-border);
}

.hud-close {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--dp-bg-elevated);
  color: var(--dp-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.hud-close:hover {
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.hud-close kbd {
  padding: 1px 4px;
  border: 1px solid var(--dp-border);
  border-radius: 4px;
  background: var(--dp-bg-panel);
  font-family: var(--dp-mono);
  font-size: 10px;
}

.banner {
  position: absolute;
  top: 18%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 34px;
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--dp-accent) 32%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--dp-bg-panel) 88%, transparent);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(8px);
  text-align: center;
  animation: banner-pop 0.5s cubic-bezier(0.2, 1.2, 0.4, 1) both;
}

.banner strong {
  background: linear-gradient(120deg, #2f6fe0, #4f8cff 40%, #5cc8ff);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  font-size: 26px;
  letter-spacing: 2px;
}

.banner span {
  color: var(--dp-text-secondary);
  font-size: 12.5px;
}

@keyframes fish-bob {
  0%,
  100% {
    transform: translateY(2px) rotate(-2deg);
  }
  50% {
    transform: translateY(-3px) rotate(2deg);
  }
}

@keyframes fish-win {
  0%,
  100% {
    transform: translateY(0) rotate(-6deg) scale(1);
  }
  25% {
    transform: translateY(-12px) rotate(6deg) scale(1.05);
  }
  50% {
    transform: translateY(0) rotate(-6deg) scale(0.98);
  }
  75% {
    transform: translateY(-8px) rotate(4deg) scale(1.03);
  }
}

@keyframes hint-float {
  0%,
  100% {
    transform: translate(-50%, 0);
  }
  50% {
    transform: translate(-50%, -3px);
  }
}

@keyframes plus-float {
  0% {
    opacity: 0;
    transform: translateY(4px) scale(0.6);
  }
  30% {
    opacity: 1;
    transform: translateY(-6px) scale(1.1);
  }
  100% {
    opacity: 0;
    transform: translateY(-26px) scale(1);
  }
}

@keyframes hud-in {
  from {
    opacity: 0;
    transform: translate(-50%, -6px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@keyframes banner-pop {
  from {
    opacity: 0;
    transform: translate(-50%, 12px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

@keyframes fireworks-fade {
  0%,
  78% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fish,
  .facing {
    transition-duration: 0.01ms;
  }

  .fish-body,
  .hint,
  .hud,
  .banner {
    animation: none;
  }
}
</style>
