import {
  add3,
  length3,
  scale3,
  sub3,
  type Vec3,
  type Vec4,
} from './math'
import { appendSegment } from './meshSegmentPrimitive'

export function appendStrokeSegment(
  vertices: number[],
  start: Vec3,
  end: Vec3,
  startRadius: number,
  endRadius: number,
  startColor: Vec4,
  endColor: Vec4,
  opacity: number,
  zOffset: number,
  offsetNormal: Vec3,
  extendStart: boolean,
  extendEnd: boolean,
) {
  const { start: segmentStart, end: segmentEnd } = extendStrokeSegment(
    start,
    end,
    startRadius,
    endRadius,
    extendStart,
    extendEnd,
  )

  appendSegment(
    vertices,
    segmentStart,
    segmentEnd,
    startRadius,
    startColor,
    endRadius,
    opacity,
    zOffset,
    offsetNormal,
    endColor,
  )
}

function extendStrokeSegment(
  start: Vec3,
  end: Vec3,
  startRadius: number,
  endRadius: number,
  extendStart: boolean,
  extendEnd: boolean,
) {
  let segmentStart = start
  let segmentEnd = end
  if (extendStart || extendEnd) {
    const delta = sub3(end, start)
    const length = length3(delta)
    if (length >= 1e-5) {
      const direction = scale3(delta, 1 / length)
      if (extendStart) {
        segmentStart = add3(segmentStart, scale3(direction, -startRadius))
      }
      if (extendEnd) {
        segmentEnd = add3(segmentEnd, scale3(direction, endRadius))
      }
    }
  }

  return {
    end: segmentEnd,
    start: segmentStart,
  } as const
}
