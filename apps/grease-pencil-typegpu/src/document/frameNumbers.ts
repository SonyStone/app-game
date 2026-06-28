import type { LayerFrame } from './model'

export const DEFAULT_FRAME_NUMBER = 1

export function sanitizeFrameNumber(frameNumber: number) {
  if (!Number.isFinite(frameNumber)) return DEFAULT_FRAME_NUMBER
  return Math.max(1, Math.round(frameNumber))
}

export function sortFrames(frames: readonly LayerFrame[]) {
  return [...frames].sort((a, b) => a.frameNumber - b.frameNumber)
}
