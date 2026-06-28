import type { Vec3, Vec4 } from '../render/math'

export function copyVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]]
}

export function copyVec4(value: Vec4): Vec4 {
  return [value[0], value[1], value[2], value[3]]
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function isFiniteVec3(value: Vec3) {
  return value.every((item) => Number.isFinite(item))
}

export function lengthSquared3(value: Vec3) {
  return value[0] ** 2 + value[1] ** 2 + value[2] ** 2
}

export function distanceToSegment(position: Vec3, start: Vec3, end: Vec3) {
  const segment = subVec3(end, start)
  const lengthSquared = dotVec3(segment, segment)
  if (lengthSquared < 1e-10) return distanceVec3(position, start)

  const rawT = dotVec3(subVec3(position, start), segment) / lengthSquared
  const t = clamp(rawT, 0, 1)
  return distanceVec3(position, addVec3(start, scaleVec3(segment, t)))
}

export function distanceBetweenSegments(
  firstStart: Vec3,
  firstEnd: Vec3,
  secondStart: Vec3,
  secondEnd: Vec3,
) {
  const firstDirection = subVec3(firstEnd, firstStart)
  const secondDirection = subVec3(secondEnd, secondStart)
  const startOffset = subVec3(firstStart, secondStart)
  const firstLengthSquared = dotVec3(firstDirection, firstDirection)
  const secondLengthSquared = dotVec3(secondDirection, secondDirection)
  const secondProjection = dotVec3(secondDirection, startOffset)
  const epsilon = 1e-10

  let firstT = 0
  let secondT = 0
  if (firstLengthSquared <= epsilon && secondLengthSquared <= epsilon) {
    return distanceVec3(firstStart, secondStart)
  }

  if (firstLengthSquared <= epsilon) {
    secondT = clamp(secondProjection / secondLengthSquared, 0, 1)
  }
  else {
    const firstProjection = dotVec3(firstDirection, startOffset)
    if (secondLengthSquared <= epsilon) {
      firstT = clamp(-firstProjection / firstLengthSquared, 0, 1)
    }
    else {
      const crossProjection = dotVec3(firstDirection, secondDirection)
      const denominator =
        firstLengthSquared * secondLengthSquared -
        crossProjection * crossProjection

      firstT =
        Math.abs(denominator) > epsilon
          ? clamp(
            (crossProjection * secondProjection -
              firstProjection * secondLengthSquared) /
              denominator,
            0,
            1,
          )
          : 0

      const secondNominal = crossProjection * firstT + secondProjection
      if (secondNominal < 0) {
        secondT = 0
        firstT = clamp(-firstProjection / firstLengthSquared, 0, 1)
      }
      else if (secondNominal > secondLengthSquared) {
        secondT = 1
        firstT = clamp(
          (crossProjection - firstProjection) / firstLengthSquared,
          0,
          1,
        )
      }
      else {
        secondT = secondNominal / secondLengthSquared
      }
    }
  }

  const firstClosest = addVec3(firstStart, scaleVec3(firstDirection, firstT))
  const secondClosest = addVec3(secondStart, scaleVec3(secondDirection, secondT))
  return distanceVec3(firstClosest, secondClosest)
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scaleVec3(value: Vec3, scale: number): Vec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale]
}

function dotVec3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function distanceVec3(a: Vec3, b: Vec3) {
  return Math.sqrt(lengthSquared3(subVec3(a, b)))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
