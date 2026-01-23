import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// ============================================================================
// MARK: Data Structures
// ============================================================================

/** Brush instance data for instanced rendering */
export const BrushInstance = d.struct({
  position: d.vec2f,
  size: d.f32,
  rotation: d.f32,
  color: d.vec4f,
  pressure: d.f32,
  _padding: d.vec3f
});

/** Brush uniforms */
export const BrushUniforms = d.struct({
  canvasSize: d.vec2f,
  _padding: d.vec2f
});

// ============================================================================
// MARK: Bind Group Layout
// ============================================================================

/** Bind group layout for brush rendering with texture */
export const brushBindGroupLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: BrushUniforms },
  instances: { storage: d.arrayOf(BrushInstance), access: 'readonly' },
  brushTexture: { texture: d.texture2d(d.f32) },
  brushSampler: { sampler: 'filtering' }
});

// ============================================================================
// MARK: Vertex Shader (WGSL template with $uses for bind group access)
// ============================================================================

/** TypeGPU vertex shader for brush rendering */
export const brushVertexShader = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex
  },
  out: {
    outPos: d.builtin.position,
    uv: d.vec2f,
    color: d.vec4f,
    pressure: d.f32
  }
}) /* wgsl */ `{
  // Quad vertices (2 triangles)
  var quadPositions = array<vec2f, 6>(
    vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(-0.5, 0.5),
    vec2f(-0.5, 0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5)
  );
  
  var quadUVs = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let instance = instances[in.instanceIndex];
  let localPos = quadPositions[in.vertexIndex];
  
  // Apply rotation
  let cos_r = cos(instance.rotation);
  let sin_r = sin(instance.rotation);
  let rotatedPos = vec2f(
    localPos.x * cos_r - localPos.y * sin_r,
    localPos.x * sin_r + localPos.y * cos_r
  );
  
  // Scale by brush size and convert to clip space
  let worldPos = instance.position + rotatedPos * instance.size;
  let clipPos = vec2f(
    (worldPos.x / uniforms.canvasSize.x) * 2.0 - 1.0,
    1.0 - (worldPos.y / uniforms.canvasSize.y) * 2.0
  );

  return Out(vec4f(clipPos, 0.0, 1.0), quadUVs[in.vertexIndex], instance.color, instance.pressure);
}`.$uses({
  uniforms: brushBindGroupLayout.bound.uniforms,
  instances: brushBindGroupLayout.bound.instances
});

// ============================================================================
// MARK: Fragment Shader (TypeScript function syntax with 'use gpu')
// ============================================================================

/** TypeGPU fragment shader for brush rendering */
export const brushFragmentShader = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
    color: d.vec4f,
    pressure: d.f32
  },
  out: d.vec4f
})(({ uv, color, pressure }) => {
  'use gpu';

  // Sample brush texture - access bind group members inline
  const brushSample = std.textureSample(brushBindGroupLayout.$.brushTexture, brushBindGroupLayout.$.brushSampler, uv);

  // Use .w for alpha (TypeGPU uses x,y,z,w)
  const alpha = brushSample.w;

  // Discard fully transparent pixels
  if (alpha < 0.001) {
    std.discard();
  }

  // Apply pressure and color alpha
  const finalAlpha = alpha * color.w * pressure;

  // Output premultiplied alpha (color * alpha) for MAX blending
  // This allows overlapping stamps within a batch to merge without darkening
  return d.vec4f(color.x * finalAlpha, color.y * finalAlpha, color.z * finalAlpha, finalAlpha);
});

// ============================================================================
// MARK: Legacy exports (removed - now using TypeGPU shaders above)
// ============================================================================

export const brushShaderWGSL = null;
