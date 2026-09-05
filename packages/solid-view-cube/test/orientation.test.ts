import { describe, expect, it } from 'vitest'
import {
  alignedFace,
  compassAngle,
  compassHitPath,
  cubeLayout,
  faces,
  snapOrientation,
  targets
} from '../src/cubeGeometry'
import {
  adjacentOrientation,
  compassOrientation,
  cross,
  dot,
  interpolateOrientation,
  normalizeOrientation,
  orbitOrientation,
  presetOrientation,
  referenceAxes,
  rollOrientation,
  scale,
  type Vec3,
  type ViewOrientation
} from '../src/orientation'

function vector(actual: Vec3, expected: Vec3) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 8))
}

function pose(actual: ViewOrientation, expected: ViewOrientation) {
  vector(actual.direction, expected.direction)
  vector(actual.up, expected.up)
}

describe('cube geometry', () => {
  it('shares each physical edge between two faces and each corner between three', () => {
    expect(targets).toHaveLength(26)
    for (const target of targets) {
      const dimensions = target.direction.filter((value) => value !== 0).length
      expect(
        faces.flatMap((face) => face.zones).filter((zone) => zone.id === target.id)
      ).toHaveLength(dimensions)
    }
  })

  it('Top and Front agree on the shared edge and its corners', () => {
    const top = faces.find((face) => face.key === 'top')!
    expect(top.zones.slice(0, 3).map((zone) => zone.label)).toEqual([
      'Top Front Left',
      'Top Front',
      'Top Front Right'
    ])
    expect(top.zones.slice(6).map((zone) => zone.label)).toEqual([
      'Top Back Left',
      'Top Back',
      'Top Back Right'
    ])
    // CSS column vectors and hit targets must describe the same physical point.
    for (const face of faces) {
      const values = face.transform
        .match(/matrix3d\(([^)]+)\)/)![1]!
        .split(',')
        .map(Number)
      face.zones.forEach((zone, index) => {
        const col = (index % 3) - 1,
          row = Math.floor(index / 3) - 1
        vector(
          zone.direction,
          [0, 1, 2].map((i) => values[i]! * col + values[4 + i]! * row + values[8 + i]!) as [
            number,
            number,
            number
          ]
        )
      })
    }
  })
})

describe('screen-space navigation', () => {
  for (const face of faces)
    for (const turn of [0, 1, 2, 3]) {
      it(`${face.label}, roll ${turn * 90}: adjacent arrows follow the screen`, () => {
        const initial = rollOrientation(presetOrientation(face.normal), (turn * Math.PI) / 2)
        const right = cross(initial.up, initial.direction)
        vector(adjacentOrientation(initial, 'right').direction, right)
        vector(adjacentOrientation(initial, 'left').direction, scale(right, -1))
        vector(adjacentOrientation(initial, 'up').direction, initial.up)
        vector(adjacentOrientation(initial, 'down').direction, scale(initial.up, -1))
        pose(adjacentOrientation(adjacentOrientation(initial, 'right'), 'left'), initial)
        pose(adjacentOrientation(adjacentOrientation(initial, 'up'), 'down'), initial)
      })
    }

  it('clockwise rotates the visible image right-to-down and four rolls restore the frame', () => {
    for (const face of faces) {
      const initial = presetOrientation(face.normal)
      const worldRight = cross(initial.up, initial.direction)
      const turned = rollOrientation(initial, Math.PI / 2)
      expect(dot(worldRight, turned.up)).toBeCloseTo(-1)
      let current = initial
      for (let i = 0; i < 4; i++) current = rollOrientation(current, Math.PI / 2)
      pose(current, initial)
    }
  })

  it('supports Y-up and a redefined Front without changing labels', () => {
    const frame = { up: [0, 1, 0], front: [0, 0, 1] } as const
    vector(presetOrientation([0, 0, 1], frame).direction, [0, 1, 0])
    vector(presetOrientation([0, -1, 0], frame).direction, [0, 0, 1])
    vector(presetOrientation([1, 0, 0], frame).direction, [1, 0, 0])
  })

  it('drag stays rigid across poles and snapping preserves the nearby frame', () => {
    const initial = presetOrientation([0, 0, 1])
    const nearby = orbitOrientation(initial, 0.04, -0.03)
    const snapped = snapOrientation(nearby)!
    vector(snapped.direction, initial.direction)
    expect(dot(snapped.up, initial.up)).toBeGreaterThan(0.99)
    const dragged = orbitOrientation(initial, 4, 3)
    expect(dot(dragged.direction, dragged.up)).toBeCloseTo(0)
    expect(Math.hypot(...dragged.direction)).toBeCloseTo(1)
  })

  it('rejects invalid vectors and never mutates caller data', () => {
    const direction = Object.freeze([0, 0, 2] as const)
    const up = Object.freeze([0, 2, 0] as const)
    pose(normalizeOrientation({ direction, up }), { direction: [0, 0, 1], up: [0, 1, 0] })
    expect(direction[2]).toBe(2)
    for (const invalid of [
      [0, 0, 0],
      [NaN, 0, 1],
      [Infinity, 0, 1]
    ] as const) {
      expect(() => normalizeOrientation({ direction: invalid, up })).toThrow(RangeError)
    }
    expect(() => normalizeOrientation({ direction, up: direction })).toThrow(RangeError)
  })
})

describe('orientation animation', () => {
  it('interpolates all preset pairs and quarter rolls without losing the camera basis', () => {
    for (const fromTarget of targets)
      for (const toTarget of targets) {
        const from = presetOrientation(fromTarget.direction)
        const to = rollOrientation(presetOrientation(toTarget.direction), Math.PI / 2)
        pose(interpolateOrientation(from, to, 0), from)
        pose(interpolateOrientation(from, to, 1), to)
        const middle = interpolateOrientation(from, to, 0.5)
        expect(dot(middle.direction, middle.up)).toBeCloseTo(0)
        expect(Math.hypot(...middle.up)).toBeCloseTo(1)
      }
  })

  it('takes the short path across the roll seam', () => {
    const initial = presetOrientation([0, -1, 0])
    const a = rollOrientation(initial, Math.PI - 0.01)
    const b = rollOrientation(initial, -Math.PI + 0.01)
    pose(interpolateOrientation(a, b, 0.5), rollOrientation(initial, Math.PI))
    expect(() => interpolateOrientation(a, b, NaN)).toThrow(RangeError)
  })
})

describe('upright orbit and compass', () => {
  for (const frame of [undefined, { up: [0, 1, 0], front: [0, 0, 1] } as const]) {
    it(`preserves zero and explicit roll through repeated diagonal drags (${frame ? 'Y' : 'Z'} up)`, () => {
      const worldUp = referenceAxes(frame).z
      for (const roll of [0, 0.4, -1.2, Math.PI]) {
        let current = rollOrientation(presetOrientation([1, -1, 1], frame), roll)
        for (let index = 0; index < 20; index++) {
          current = orbitOrientation(current, 0.13, index % 2 ? -0.03 : 0.03, frame)
          const upright = normalizeOrientation({ direction: current.direction, up: worldUp })
          pose(current, rollOrientation(upright, roll))
        }
      }
    })
    it(`clamps elevation and leaves both poles without a flipped horizon (${frame ? 'Y' : 'Z'} up)`, () => {
      const worldUp = referenceAxes(frame).z
      for (const sign of [-1, 1]) {
        const pole = presetOrientation([0, 0, sign], frame)
        const result = orbitOrientation(pole, 0.2, -sign * 0.4, frame)
        expect(dot(result.up, worldUp)).toBeGreaterThan(0)
        expect(dot(result.direction, result.up)).toBeCloseTo(0)
        const clamped = orbitOrientation(result, 0, sign * 100, frame)
        expect(dot(clamped.direction, scale(worldUp, sign))).toBeGreaterThan(
          Math.cos(Math.PI / 180)
        )
        expect(dot(clamped.direction, scale(worldUp, sign))).toBeLessThan(1)
        expect(alignedFace(clamped, frame)).toBeUndefined()
        pose(orbitOrientation(pole, 0, 0, frame), pole)
      }
    })
    it(`compass keeps elevation and roll while selecting a cardinal heading (${frame ? 'Y' : 'Z'} up)`, () => {
      const initial = rollOrientation(presetOrientation([1, -1, 1], frame), 0.37)
      const worldUp = referenceAxes(frame).z
      for (const heading of [
        [0, 1, 0],
        [1, 0, 0],
        [0, -1, 0],
        [-1, 0, 0]
      ] as const) {
        const result = compassOrientation(initial, heading, frame)
        expect(dot(result.direction, worldUp)).toBeCloseTo(dot(initial.direction, worldUp))
        const upright = normalizeOrientation({ direction: result.direction, up: worldUp })
        pose(result, rollOrientation(upright, 0.37))
      }
    })
  }
})

it('compass screen hit path and inverse gesture angle agree under perspective and roll', () => {
  for (const direction of [
    [1, -1, 1],
    [1, -1, 0.15],
    [0, 0, 1]
  ] as const)
    for (const roll of [0, 0.7, -1.3]) {
      const orientation = rollOrientation(presetOrientation(direction), roll)
      const points = compassHitPath(orientation)
        .replace(/[MLZ]/g, '')
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number))
      for (let index = 0; index < 96; index++) {
        const point = points[index]!
        const angle = compassAngle(
          orientation,
          ((point[0]! - 50) / 100) * cubeLayout.stage,
          ((point[1]! - 50) / 100) * cubeLayout.stage
        )!
        const expected = (-index * Math.PI) / 48
        expect(Math.sin(angle)).toBeCloseTo(Math.sin(expected), 8)
        expect(Math.cos(angle)).toBeCloseTo(Math.cos(expected), 8)
      }
    }
})

it('adjacent arrows require both a face normal and a quarter-turn roll', () => {
  for (const face of faces) {
    const initial = presetOrientation(face.normal)
    for (const turn of [0, 1, 2, 3])
      expect(alignedFace(rollOrientation(initial, (turn * Math.PI) / 2))?.key).toBe(face.key)
    for (const roll of [0.02, 0.3, Math.PI / 4])
      expect(alignedFace(rollOrientation(initial, roll))).toBeUndefined()
  }
})

it('quarter-rolled orbit follows screen movement and preserves the deliberate roll', () => {
  for (const roll of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const initial = rollOrientation(presetOrientation([1, -1, 1]), roll)
    const right = cross(initial.up, initial.direction)
    const horizontal = orbitOrientation(initial, 0.001, 0)
    const vertical = orbitOrientation(initial, 0, 0.001)
    expect(dot(horizontal.direction, right)).toBeLessThan(0)
    expect(Math.abs(dot(horizontal.direction, initial.up))).toBeLessThan(0.000001)
    expect(dot(vertical.direction, initial.up)).toBeGreaterThan(0)
    expect(Math.abs(dot(vertical.direction, right))).toBeLessThan(0.000001)
  }
})

it('keeps the same roll when a new gesture starts at either elevation limit', () => {
  for (const sign of [-1, 1]) {
    const roll = 0.43
    const initial = rollOrientation(presetOrientation([1, -1, sign]), roll)
    const limited = orbitOrientation(initial, 0, sign * 100)
    const continued = orbitOrientation(limited, 0.00001, 0)
    expect(dot(limited.up, continued.up)).toBeGreaterThan(0.999999)
    pose(
      continued,
      rollOrientation(normalizeOrientation({ direction: continued.direction, up: [0, 0, 1] }), roll)
    )
  }
})
