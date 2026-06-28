export const strokeShaderCode = /* wgsl */ `
const DISC_SEGMENTS: u32 = 14u;
const DISC_VERTEX_COUNT: u32 = DISC_SEGMENTS * 3u;
const TAU: f32 = 6.28318530718;

struct CameraUniforms {
  viewProjection: mat4x4f,
  billboardNormal: vec4f,
  billboardRight: vec4f,
  billboardUp: vec4f,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<storage, read> primitiveData: array<vec4f>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

fn safeNormalize(value: vec3f) -> vec3f {
  let valueLength = length(value);
  if (valueLength < 0.00001) {
    return vec3f(0.0, 0.0, 0.0);
  }
  return value / valueLength;
}

fn outputVertex(position: vec3f, color: vec4f) -> VertexOut {
  var output: VertexOut;
  output.position = camera.viewProjection * vec4f(position, 1.0);
  output.color = color;
  return output;
}

fn strokeSideVector(previous: vec3f, point: vec3f, next: vec3f) -> vec3f {
  let previousDelta = point - previous;
  let nextDelta = next - point;
  let hasPrevious = length(previousDelta) >= 0.00001;
  let hasNext = length(nextDelta) >= 0.00001;
  if (!hasPrevious && !hasNext) {
    return camera.billboardRight.xyz;
  }
  if (!hasPrevious) {
    return safeNormalize(cross(camera.billboardNormal.xyz, nextDelta));
  }
  if (!hasNext) {
    return safeNormalize(cross(camera.billboardNormal.xyz, previousDelta));
  }

  let previousSide = safeNormalize(cross(camera.billboardNormal.xyz, previousDelta));
  let nextSide = safeNormalize(cross(camera.billboardNormal.xyz, nextDelta));
  let miter = safeNormalize(previousSide + nextSide);
  if (length(miter) < 0.00001) {
    return nextSide;
  }

  let denominator = abs(dot(miter, nextSide));
  let miterScale = clamp(1.0 / max(denominator, 0.25), 0.0, 4.0);
  return miter * miterScale;
}

fn strokeTangent(previous: vec3f, point: vec3f, next: vec3f) -> vec3f {
  let previousDelta = point - previous;
  let nextDelta = next - point;
  if (length(nextDelta) >= 0.00001) {
    return safeNormalize(nextDelta);
  }
  if (length(previousDelta) >= 0.00001) {
    return safeNormalize(previousDelta);
  }
  return vec3f(0.0, 0.0, 0.0);
}

fn ribbonEndpoint(
  previous: vec4f,
  point: vec4f,
  next: vec4f,
  side: f32,
  zOffset: f32,
  capExtend: f32,
  capDirection: f32,
) -> vec3f {
  let tangent = strokeTangent(previous.xyz, point.xyz, next.xyz);
  let capOffset = tangent * point.w * capExtend * capDirection;
  return point.xyz
    + capOffset
    + strokeSideVector(previous.xyz, point.xyz, next.xyz) * point.w * side
    + camera.billboardNormal.xyz * zOffset;
}

@vertex
fn segmentVertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let localVertex = vertexIndex % 6u;
  let base = instanceIndex * 7u;
  let previous = primitiveData[base];
  let start = primitiveData[base + 1u];
  let end = primitiveData[base + 2u];
  let next = primitiveData[base + 3u];
  let startColor = primitiveData[base + 4u];
  let endColor = primitiveData[base + 5u];
  let options = primitiveData[base + 6u];
  let useEnd = localVertex == 2u || localVertex == 3u || localVertex == 5u;
  let positiveSide = localVertex == 0u || localVertex == 2u || localVertex == 3u;
  let color = select(startColor, endColor, useEnd);
  let side = select(-1.0, 1.0, positiveSide);
  let position = select(
    ribbonEndpoint(previous, start, end, side, options.x, options.y, -1.0),
    ribbonEndpoint(start, end, next, side, options.x, options.z, 1.0),
    useEnd,
  );
  return outputVertex(position, color);
}

@vertex
fn discVertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let localVertex = vertexIndex % DISC_VERTEX_COUNT;
  let segmentIndex = localVertex / 3u;
  let corner = localVertex % 3u;
  let base = instanceIndex * 3u;
  let centerAndRadius = primitiveData[base];
  let color = primitiveData[base + 1u];
  let options = primitiveData[base + 2u];
  let center = centerAndRadius.xyz + camera.billboardNormal.xyz * options.x;
  if (corner == 0u) {
    return outputVertex(center, color);
  }

  let angleIndex = segmentIndex + select(0u, 1u, corner == 2u);
  let angle = (f32(angleIndex) / f32(DISC_SEGMENTS)) * TAU;
  let edge = center
    + camera.billboardRight.xyz * cos(angle) * centerAndRadius.w
    + camera.billboardUp.xyz * sin(angle) * centerAndRadius.w;
  return outputVertex(edge, color);
}

@vertex
fn squareVertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  let localVertex = vertexIndex % 6u;
  let base = instanceIndex * 3u;
  let centerAndRadius = primitiveData[base];
  let color = primitiveData[base + 1u];
  let options = primitiveData[base + 2u];
  let center = centerAndRadius.xyz + camera.billboardNormal.xyz * options.x;
  var side = vec2f(1.0, 1.0);
  if (localVertex == 1u || localVertex == 4u || localVertex == 5u) {
    side.x = -1.0;
  }
  if (localVertex == 2u || localVertex == 3u || localVertex == 5u) {
    side.y = -1.0;
  }

  let position = center
    + camera.billboardRight.xyz * side.x * centerAndRadius.w
    + camera.billboardUp.xyz * side.y * centerAndRadius.w;
  return outputVertex(position, color);
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
  return input.color;
}
`
