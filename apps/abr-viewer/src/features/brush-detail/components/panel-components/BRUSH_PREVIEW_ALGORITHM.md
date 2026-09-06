# Brush Preview Rendering Algorithm

This document describes the algorithm used in `BrushPreviewCanvas.tsx` to render brush stroke previews that closely match Adobe Photoshop's brush engine. This serves as a reference for future implementations in WebGL/WebGPU.

## Overview

The brush preview renders a stroke along an S-curve path by "stamping" brush tip images at regular intervals. The key to matching Photoshop's appearance is:

1. **Linear color space blending** - All alpha compositing and color blending happens in linear RGB, not sRGB
2. **Smoothstep hardness falloff** - Soft brushes use non-linear (ease-in-out) opacity falloff
3. **Bilinear interpolation** - Smooth sampling when scaling/rotating the brush tip
4. **Porter-Duff "over" compositing** - Standard alpha blending between overlapping stamps

---

## Pipeline Stages

### 1. Brush Tip Generation (for computed brushes)

For brushes without a custom tip image, generate a circular brush with hardness control.

```
Input: size (pixels), hardness (0-100%)
Output: grayscale alpha mask (Uint8Array)

For each pixel (x, y):
  1. Calculate distance from center: dist = sqrt(dx² + dy²)
  2. If dist <= hardnessRadius: alpha = 1.0
  3. Else if dist <= radius:
     - t = (dist - hardnessRadius) / (radius - hardnessRadius)  // 0 to 1
     - alpha = 1 - smoothstep(t)
  4. Else: alpha = 0
```

**Smoothstep function** (ease-in-out curve):
```
smoothstep(t) = t² × (3 - 2t)
```

This creates a smooth S-curve falloff that matches Photoshop's soft brush appearance.

---

### 2. Path Generation

Generate an S-curve path for the preview stroke:

```
For t from 0 to 1 (step 0.005):
  x = padding + (width - 2×padding) × t
  y = centerY + amplitude × sin(t × 2π - π/2) × (1 - |t - 0.5| × 0.5)
```

Calculate cumulative distances along the path for spacing calculations.

---

### 3. Stamp Placement

Place brush stamps along the path at intervals determined by brush spacing:

```
spacingPx = brushSize × (spacing / 100)

While currentDistance < totalPathLength:
  1. Interpolate position on path at currentDistance
  2. Calculate path angle at this point (for direction-based effects)
  3. Apply dynamics (size jitter, angle jitter, scattering, etc.)
  4. Stamp brush tip to alpha mask
  5. currentDistance += spacingPx
```

---

### 4. Brush Tip Stamping (Critical for quality)

Transform and stamp the brush tip onto the alpha mask buffer.

#### 4.1 Coordinate Transformation

For each destination pixel, transform back to brush tip coordinates:

```glsl
// In shader terms (for WebGL/WebGPU implementation):
vec2 transformToBrushCoords(vec2 destPixel, vec2 stampCenter, float angle, float scale, float roundness) {
  vec2 offset = destPixel - stampCenter;
  
  // Inverse rotation
  float cos_a = cos(-angle);
  float sin_a = sin(-angle);
  vec2 rotated = vec2(
    offset.x * cos_a + offset.y * sin_a,
    (-offset.x * sin_a + offset.y * cos_a) / roundness
  );
  
  // Scale to brush tip coordinates
  return rotated / scale + brushTipSize / 2.0;
}
```

#### 4.2 Bilinear Sampling

Sample the brush tip with bilinear interpolation (NOT nearest-neighbor):

```glsl
float sampleBrushTip(sampler2D brushTip, vec2 uv) {
  // Standard bilinear interpolation
  vec2 texel = uv * textureSize - 0.5;
  vec2 f = fract(texel);
  ivec2 i = ivec2(floor(texel));
  
  float v00 = texelFetch(brushTip, i, 0).r;
  float v10 = texelFetch(brushTip, i + ivec2(1, 0), 0).r;
  float v01 = texelFetch(brushTip, i + ivec2(0, 1), 0).r;
  float v11 = texelFetch(brushTip, i + ivec2(1, 1), 0).r;
  
  return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
}
```

#### 4.3 Alpha Blending in Linear Space

**Critical**: All blending must happen in linear color space.

```glsl
// Convert sRGB alpha to linear
float srgbToLinear(float v) {
  return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}

// Porter-Duff "over" compositing
float blendAlpha(float src, float dst) {
  return src + dst * (1.0 - src);
}

// In the stamp loop:
float srgbAlpha = sampleBrushTip(brushTip, brushCoords) * opacity;
float linearAlpha = srgbToLinear(srgbAlpha);
maskBuffer[pixelIndex] = blendAlpha(linearAlpha, maskBuffer[pixelIndex]);
```

---

### 5. Final Compositing with Background

Blend the stroke (foreground) with the background color, all in linear space:

```glsl
// Convert colors to linear space
vec3 linearFg = srgbToLinear(foregroundColor);
vec3 linearBg = srgbToLinear(backgroundColor);

// Alpha blend in linear space
vec3 linearResult = linearFg * alpha + linearBg * (1.0 - alpha);

// Convert back to sRGB for display
vec3 srgbResult = linearToSrgb(linearResult);
```

**sRGB ↔ Linear conversion functions:**

```glsl
float srgbToLinear(float v) {
  return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}

float linearToSrgb(float v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}
```

---

## WebGL/WebGPU Implementation Notes

### Recommended Architecture

1. **Brush Tip Texture**: Upload brush tip as R8 texture (single channel, 8-bit)

2. **Alpha Mask Buffer**: Use a floating-point render target (R32F or R16F) for the stroke accumulation buffer

3. **Two-Pass Rendering**:
   - **Pass 1**: Stamp all brush tips to the alpha mask using additive blending with custom blend equation
   - **Pass 2**: Composite the alpha mask with foreground/background colors

### Blend State for Stamping

WebGPU blend state for Porter-Duff "over" on alpha channel:
```javascript
blend: {
  color: {
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
    operation: 'add'
  },
  alpha: {
    srcFactor: 'one', 
    dstFactor: 'one-minus-src-alpha',
    operation: 'add'
  }
}
```

### Fragment Shader for Stamping

```wgsl
@fragment
fn stampBrush(input: VertexOutput) -> @location(0) f32 {
  // Transform to brush tip coordinates
  let brushCoord = transformToBrushCoords(input.position.xy, uniforms.stampCenter, 
                                           uniforms.angle, uniforms.scale, uniforms.roundness);
  
  // Bounds check
  if (brushCoord.x < 0.0 || brushCoord.x >= f32(uniforms.brushWidth) ||
      brushCoord.y < 0.0 || brushCoord.y >= f32(uniforms.brushHeight)) {
    discard;
  }
  
  // Bilinear sample (or use texture sampler with linear filtering)
  let srgbAlpha = textureSample(brushTipTexture, brushSampler, brushCoord / vec2f(uniforms.brushSize)).r;
  
  // Convert to linear and apply opacity
  let linearAlpha = srgbToLinear(srgbAlpha * uniforms.opacity);
  
  return linearAlpha;
}
```

### Fragment Shader for Final Composite

```wgsl
@fragment
fn compositeWithBackground(input: VertexOutput) -> @location(0) vec4f {
  let alpha = textureSample(alphaMask, maskSampler, input.uv).r;
  
  // Linear space blending
  let linearFg = srgbToLinear(uniforms.foregroundColor);
  let linearBg = srgbToLinear(uniforms.backgroundColor);
  
  let linearResult = linearFg * alpha + linearBg * (1.0 - alpha);
  
  // Convert to sRGB for display
  return vec4f(linearToSrgb(linearResult), 1.0);
}
```

---

## Key Insights for Photoshop-Accurate Rendering

| Aspect | Wrong Approach | Correct Approach |
|--------|----------------|------------------|
| Color space | Blend in sRGB | Blend in linear RGB |
| Brush sampling | Nearest-neighbor | Bilinear interpolation |
| Hardness falloff | Linear ramp | Smoothstep (ease-in-out) |
| Alpha compositing | Additive or MAX | Porter-Duff "over" |
| Background blend | Browser compositing | Manual linear-space blend |

---

## Performance Considerations

### Current Canvas 2D Implementation
- CPU-bound: iterates every pixel in stamp bounding box
- Creates temporary canvases for compositing
- Suitable for preview but not real-time painting

### WebGL/WebGPU Benefits
- GPU-accelerated stamping via instanced rendering
- Hardware bilinear filtering
- Floating-point render targets for accurate blending
- Potential for thousands of stamps per frame

### Optimization Opportunities
1. **Instanced rendering**: Draw all stamps in a single draw call
2. **Texture atlasing**: Batch multiple brush tips
3. **Compute shaders**: Pre-calculate stamp positions and transforms
4. **Mipmapping**: For smooth downscaling of large brush tips
