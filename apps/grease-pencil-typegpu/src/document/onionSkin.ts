import { copyVec4 } from './geometry'
import type { GreaseDocument, OnionSkinSettings } from './model'

export function setOnionSkinEnabled(
  document: GreaseDocument,
  enabled: boolean,
): GreaseDocument {
  return {
    ...document,
    onionSkin: {
      ...document.onionSkin,
      enabled,
    },
  }
}

export function setOnionSkinPreviousFrames(
  document: GreaseDocument,
  previousFrames: number,
): GreaseDocument {
  return {
    ...document,
    onionSkin: {
      ...document.onionSkin,
      previousFrames: sanitizeOnionFrameCount(previousFrames),
    },
  }
}

export function setOnionSkinNextFrames(
  document: GreaseDocument,
  nextFrames: number,
): GreaseDocument {
  return {
    ...document,
    onionSkin: {
      ...document.onionSkin,
      nextFrames: sanitizeOnionFrameCount(nextFrames),
    },
  }
}

export function setOnionSkinOpacity(
  document: GreaseDocument,
  opacity: number,
): GreaseDocument {
  return {
    ...document,
    onionSkin: {
      ...document.onionSkin,
      opacity: clamp01(opacity),
    },
  }
}

export function createDefaultOnionSkinSettings(): OnionSkinSettings {
  return {
    enabled: false,
    previousFrames: 1,
    nextFrames: 1,
    opacity: 0.32,
    previousColor: [0.16, 0.42, 1, 1],
    nextColor: [0.05, 0.72, 0.38, 1],
  }
}

export function normalizeOnionSkinSettings(
  onionSkin: OnionSkinSettings | undefined,
): OnionSkinSettings {
  const defaults = createDefaultOnionSkinSettings()
  if (!onionSkin) return defaults

  return {
    enabled: onionSkin.enabled,
    previousFrames: sanitizeOnionFrameCount(onionSkin.previousFrames),
    nextFrames: sanitizeOnionFrameCount(onionSkin.nextFrames),
    opacity: clamp01(onionSkin.opacity),
    previousColor: copyVec4(onionSkin.previousColor),
    nextColor: copyVec4(onionSkin.nextColor),
  }
}

function sanitizeOnionFrameCount(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(6, Math.round(value)))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}
