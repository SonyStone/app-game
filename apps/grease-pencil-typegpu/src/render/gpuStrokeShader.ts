import tgpu, { d, std } from 'typegpu'
import {
  cameraBindGroupLayout,
  strokeDataBindGroupLayout,
} from './gpuCameraBindings'

const DISC_SEGMENTS = 14
const DISC_VERTEX_COUNT = DISC_SEGMENTS * 3
const EPSILON = 0.00001
const TAU = 6.28318530718

const safeNormalize = tgpu.fn([d.vec3f], d.vec3f)((value) => {
  'use gpu'

  const valueLength = std.length(value)
  if (valueLength < EPSILON) {
    return d.vec3f(0, 0, 0)
  }
  return d.vec3f(std.div(value, valueLength))
})

const strokeSideVector = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)(
  (previous, point, next) => {
    'use gpu'

    const previousDelta = std.sub(point, previous)
    const nextDelta = std.sub(next, point)
    const hasPrevious = std.length(previousDelta) >= EPSILON
    const hasNext = std.length(nextDelta) >= EPSILON
    if (!hasPrevious && !hasNext) {
      return d.vec3f(cameraBindGroupLayout.$.camera.billboardRight.xyz)
    }
    if (!hasPrevious) {
      return safeNormalize(
        std.cross(
          cameraBindGroupLayout.$.camera.billboardNormal.xyz,
          nextDelta,
        ),
      )
    }
    if (!hasNext) {
      return safeNormalize(
        std.cross(
          cameraBindGroupLayout.$.camera.billboardNormal.xyz,
          previousDelta,
        ),
      )
    }

    const previousSide = safeNormalize(
      std.cross(
        cameraBindGroupLayout.$.camera.billboardNormal.xyz,
        previousDelta,
      ),
    )
    const nextSide = safeNormalize(
      std.cross(cameraBindGroupLayout.$.camera.billboardNormal.xyz, nextDelta),
    )
    const miter = safeNormalize(std.add(previousSide, nextSide))
    if (std.length(miter) < EPSILON) {
      return d.vec3f(nextSide)
    }

    const denominator = std.abs(std.dot(miter, nextSide))
    const miterScale = std.clamp(
      std.div(1, std.max(denominator, 0.25)),
      0,
      4,
    )
    return d.vec3f(std.mul(miter, miterScale))
  },
)

const strokeTangent = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)(
  (previous, point, next) => {
    'use gpu'

    const previousDelta = std.sub(point, previous)
    const nextDelta = std.sub(next, point)
    if (std.length(nextDelta) >= EPSILON) {
      return safeNormalize(nextDelta)
    }
    if (std.length(previousDelta) >= EPSILON) {
      return safeNormalize(previousDelta)
    }
    return d.vec3f(0, 0, 0)
  },
)

const strokeCapExtension = tgpu.fn([d.f32, d.f32], d.f32)(
  (capStyle, _joinStyle) => {
    'use gpu'

    if (capStyle > 0.5 && capStyle < 1.5) {
      return 1
    }
    return 0
  },
)

const ribbonEndpoint = tgpu.fn(
  [d.vec4f, d.vec4f, d.vec4f, d.f32, d.f32, d.f32, d.f32, d.f32],
  d.vec3f,
)((previous, point, next, side, zOffset, capStyle, capDirection, joinStyle) => {
  'use gpu'

  const tangent = strokeTangent(previous.xyz, point.xyz, next.xyz)
  const capExtend = strokeCapExtension(capStyle, joinStyle)
  const capOffset = std.mul(
    tangent,
    std.mul(std.mul(point.w, capExtend), capDirection),
  )
  const sideVector = strokeSideVector(previous.xyz, point.xyz, next.xyz)
  const sideOffset = std.mul(sideVector, std.mul(point.w, side))
  const normalOffset = std.mul(
    cameraBindGroupLayout.$.camera.billboardNormal.xyz,
    zOffset,
  )
  return d.vec3f(
    std.add(std.add(std.add(point.xyz, capOffset), sideOffset), normalOffset),
  )
})

export const segmentVertexMain = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: {
    position: d.builtin.position,
    color: d.vec4f,
    strokeDepth: d.f32,
  },
})(({ vertexIndex, instanceIndex }) => {
  'use gpu'

  const localVertex = vertexIndex % 6
  const base = instanceIndex * 8
  const previous = strokeDataBindGroupLayout.$.primitiveData[base]
  const start = strokeDataBindGroupLayout.$.primitiveData[base + 1]
  const end = strokeDataBindGroupLayout.$.primitiveData[base + 2]
  const next = strokeDataBindGroupLayout.$.primitiveData[base + 3]
  const startColor = strokeDataBindGroupLayout.$.primitiveData[base + 4]
  const endColor = strokeDataBindGroupLayout.$.primitiveData[base + 5]
  const options = strokeDataBindGroupLayout.$.primitiveData[base + 6]
  const depthOptions = strokeDataBindGroupLayout.$.primitiveData[base + 7]
  const useEnd = localVertex === 2 || localVertex === 3 || localVertex === 5
  const positiveSide =
    localVertex === 0 || localVertex === 2 || localVertex === 3
  const side = std.select(d.f32(-1), d.f32(1), positiveSide)
  const startPosition = ribbonEndpoint(
    previous,
    start,
    end,
    side,
    options.x,
    options.y,
    -1,
    options.w,
  )
  const endPosition = ribbonEndpoint(
    start,
    end,
    next,
    side,
    options.x,
    options.z,
    1,
    options.w,
  )
  const position = std.select(startPosition, endPosition, useEnd)
  const color = std.select(startColor, endColor, useEnd)

  return {
    position: std.mul(
      cameraBindGroupLayout.$.camera.viewProjection,
      d.vec4f(position, d.f32(1)),
    ),
    color: d.vec4f(color),
    strokeDepth: depthOptions.x,
  }
})

export const discVertexMain = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: {
    position: d.builtin.position,
    color: d.vec4f,
    strokeDepth: d.f32,
  },
})(({ vertexIndex, instanceIndex }) => {
  'use gpu'

  const localVertex = vertexIndex % DISC_VERTEX_COUNT
  const segmentIndex = std.floor(localVertex / 3)
  const corner = localVertex % 3
  const base = instanceIndex * 3
  const centerAndRadius = strokeDataBindGroupLayout.$.primitiveData[base]
  const color = strokeDataBindGroupLayout.$.primitiveData[base + 1]
  const options = strokeDataBindGroupLayout.$.primitiveData[base + 2]
  const center = std.add(
    centerAndRadius.xyz,
    std.mul(cameraBindGroupLayout.$.camera.billboardNormal.xyz, options.x),
  )
  if (corner === 0) {
    return {
      position: std.mul(
        cameraBindGroupLayout.$.camera.viewProjection,
        d.vec4f(center, d.f32(1)),
      ),
      color: d.vec4f(color),
      strokeDepth: options.y,
    }
  }

  const angleIndex = std.add(
    segmentIndex,
    std.select(d.f32(0), d.f32(1), corner === 2),
  )
  const angle = std.mul(std.div(angleIndex, DISC_SEGMENTS), TAU)
  const rightOffset = std.mul(
    cameraBindGroupLayout.$.camera.billboardRight.xyz,
    std.mul(std.cos(angle), centerAndRadius.w),
  )
  const upOffset = std.mul(
    cameraBindGroupLayout.$.camera.billboardUp.xyz,
    std.mul(std.sin(angle), centerAndRadius.w),
  )
  const edge = std.add(std.add(center, rightOffset), upOffset)
  return {
    position: std.mul(
      cameraBindGroupLayout.$.camera.viewProjection,
      d.vec4f(edge, d.f32(1)),
    ),
    color: d.vec4f(color),
    strokeDepth: options.y,
  }
})

export const squareVertexMain = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: {
    position: d.builtin.position,
    color: d.vec4f,
    strokeDepth: d.f32,
  },
})(({ vertexIndex, instanceIndex }) => {
  'use gpu'

  const localVertex = vertexIndex % 6
  const base = instanceIndex * 3
  const centerAndRadius = strokeDataBindGroupLayout.$.primitiveData[base]
  const color = strokeDataBindGroupLayout.$.primitiveData[base + 1]
  const options = strokeDataBindGroupLayout.$.primitiveData[base + 2]
  const center = std.add(
    centerAndRadius.xyz,
    std.mul(cameraBindGroupLayout.$.camera.billboardNormal.xyz, options.x),
  )
  const sideX = std.select(
    d.f32(1),
    d.f32(-1),
    localVertex === 1 || localVertex === 4 || localVertex === 5,
  )
  const sideY = std.select(
    d.f32(1),
    d.f32(-1),
    localVertex === 2 || localVertex === 3 || localVertex === 5,
  )
  const rightOffset = std.mul(
    cameraBindGroupLayout.$.camera.billboardRight.xyz,
    std.mul(sideX, centerAndRadius.w),
  )
  const upOffset = std.mul(
    cameraBindGroupLayout.$.camera.billboardUp.xyz,
    std.mul(sideY, centerAndRadius.w),
  )
  const position = std.add(std.add(center, rightOffset), upOffset)

  return {
    position: std.mul(
      cameraBindGroupLayout.$.camera.viewProjection,
      d.vec4f(position, d.f32(1)),
    ),
    color: d.vec4f(color),
    strokeDepth: options.y,
  }
})

export const segmentFragmentMain = tgpu.fragmentFn({
  in: {
    color: d.vec4f,
    strokeDepth: d.f32,
  },
  out: {
    color: d.vec4f,
    depth: d.builtin.fragDepth,
  },
})(({ color, strokeDepth }) => {
  'use gpu'

  return {
    color: d.vec4f(color),
    depth: strokeDepth,
  }
})

export const pointFragmentMain = tgpu.fragmentFn({
  in: {
    color: d.vec4f,
    strokeDepth: d.f32,
  },
  out: {
    color: d.vec4f,
    depth: d.builtin.fragDepth,
  },
})(({ color, strokeDepth }) => {
  'use gpu'

  return {
    color: d.vec4f(color),
    depth: strokeDepth,
  }
})
