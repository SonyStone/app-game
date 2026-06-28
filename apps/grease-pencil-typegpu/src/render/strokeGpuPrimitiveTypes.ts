import {
  length3,
  sub3,
  type Vec3,
  type Vec4,
} from './math'
import type { StrokeCapStyle, StrokeJoinStyle } from '../document'

export const STROKE_SEGMENT_FLOATS = 32
export const STROKE_POINT_FLOATS = 12
export const STROKE_SEGMENT_VERTEX_COUNT = 6
export const STROKE_DISC_VERTEX_COUNT = 42
export const STROKE_SQUARE_VERTEX_COUNT = 6
export const STROKE_SELF_OVERLAP_DEPTH_STEP = 0.000000001

export type StrokeGpuPrimitives = {
  segments: number[]
  discs: number[]
  squares: number[]
  ranges: StrokeGpuPrimitiveRange[]
}

export type StrokeGpuPrimitiveRange = {
  segmentStart: number
  segmentCount: number
  discStart: number
  discCount: number
  squareStart: number
  squareCount: number
}

export function strokeJoinStyleCode(joinStyle: StrokeJoinStyle) {
  switch (joinStyle) {
    case 'round':
      return 0
    case 'bevel':
      return 1
    case 'miter':
      return 2
  }
}

export function strokeCapStyleCode(capStyle: StrokeCapStyle | 'join') {
  switch (capStyle) {
    case 'flat':
      return -1
    case 'join':
      return 0
    case 'square':
      return 1
    case 'round':
      return 2
  }
}

export function createStrokeGpuPrimitives(): StrokeGpuPrimitives {
  return {
    segments: [],
    discs: [],
    squares: [],
    ranges: [],
  }
}

export function appendSegmentPrimitive(
  segments: number[],
  previous: Vec3,
  start: Vec3,
  end: Vec3,
  next: Vec3,
  strokeDepth: number,
  startRadius: number,
  endRadius: number,
  startColor: Vec4,
  endColor: Vec4,
  opacity: number,
  zOffset: number,
  startCapStyle: StrokeCapStyle | 'join',
  endCapStyle: StrokeCapStyle | 'join',
  joinStyle: StrokeJoinStyle,
) {
  if (length3(sub3(end, start)) < 1e-5) return

  segments.push(
    previous[0],
    previous[1],
    previous[2],
    startRadius,
    start[0],
    start[1],
    start[2],
    startRadius,
    end[0],
    end[1],
    end[2],
    endRadius,
    next[0],
    next[1],
    next[2],
    endRadius,
    startColor[0],
    startColor[1],
    startColor[2],
    startColor[3] * opacity,
    endColor[0],
    endColor[1],
    endColor[2],
    endColor[3] * opacity,
    zOffset,
    strokeCapStyleCode(startCapStyle),
    strokeCapStyleCode(endCapStyle),
    strokeJoinStyleCode(joinStyle),
    strokeDepth,
    0,
    0,
    0,
  )
}

export function appendPointPrimitive(
  target: number[],
  center: Vec3,
  radius: number,
  color: Vec4,
  opacity: number,
  zOffset: number,
  strokeDepth: number,
) {
  const safeRadius = Math.max(radius, 0.002)
  target.push(
    center[0],
    center[1],
    center[2],
    safeRadius,
    color[0],
    color[1],
    color[2],
    color[3] * opacity,
    zOffset,
    strokeDepth,
    0,
    0,
  )
}
