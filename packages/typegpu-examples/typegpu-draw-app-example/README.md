# TypeGPU Draw App Example

A GPU-accelerated drawing application built with **TypeGPU** and **SolidJS**, demonstrating advanced WebGPU rendering techniques for real-time brush strokes with blend modes and canvas transformations.

![WebGPU Drawing App](https://img.shields.io/badge/WebGPU-Enabled-blue)
![TypeGPU](https://img.shields.io/badge/TypeGPU-Type--Safe_GPU-green)
![SolidJS](https://img.shields.io/badge/SolidJS-Reactive_UI-orange)

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Rendering Pipeline](#rendering-pipeline)
- [Key Components](#key-components)
- [Hybrid TypeGPU + Raw WGSL Approach](#hybrid-typegpu--raw-wgsl-approach)
- [Things to Pay Attention To](#things-to-pay-attention-to)
- [Performance Considerations](#performance-considerations)

---

## Overview

This example demonstrates a full-featured drawing application that leverages WebGPU for:

- **GPU-accelerated brush rendering** with instanced drawing
- **Procedural brush texture generation** via compute shaders
- **Multiple blend modes** (Normal, Multiply, Screen, Overlay)
- **Color space transformations** (Gamma, Linear, HSV)
- **Canvas transformations** (Pan, Zoom, Rotate)
- **Ping-pong buffer accumulation** for stroke compositing
- **Fixed-size drawing canvas** (4000×4000 pixels by default) with dynamic display scaling

The app showcases **full TypeGPU integration**: TypeGPU for data types, buffers, textures, AND shaders using the TypeScript function syntax with `'use gpu'`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          index.tsx                               │
│                    (SolidJS Application)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ UI Controls │  │ Pointer     │  │ Canvas Transform        │  │
│  │ (Brush,     │  │ Input       │  │ (Pan/Zoom/Rotate)       │  │
│  │ Blend Mode) │  │ Handling    │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Rendering Pipeline                          │
│                  (All TypeGPU with 'use gpu')                    │
│                                                                  │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────────┐   │
│  │ BrushStroke  │───▶│  BlendPass  │───▶│   DisplayPass    │   │
│  │  (TypeGPU)   │    │  (TypeGPU)  │    │    (TypeGPU)     │   │
│  └──────────────┘    └─────────────┘    └──────────────────┘   │
│         │                   │                                   │
│         ▼                   ▼                                   │
│  ┌──────────────┐    ┌─────────────┐                           │
│  │ BrushTexture │    │ SwapBuffer  │                           │
│  │  (TypeGPU)   │    │ (Ping-Pong) │                           │
│  └──────────────┘    └─────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Pointer Input** → Generates `StrokePoint[]` from mouse/touch events
2. **BrushStroke** → Renders stroke points as instanced quads to a texture
3. **BlendPass** → Composites brush texture onto accumulated canvas (SwapBuffer)
4. **DisplayPass** → Renders final canvas to screen with transformations

---

## Features

### 🖌️ Brush System

- **Soft/Hard brushes** with adjustable hardness (0-1)
- **Variable brush size** in pixels
- **Opacity control** (0-1)
- **Spacing control** (1-100% of brush size)
- **Pressure sensitivity** support (from pointer events)
- **GPU-generated brush textures** via compute shaders

### 🎨 Blend Modes

| Mode         | Description                                     |
| ------------ | ----------------------------------------------- |
| **Normal**   | Standard alpha compositing                      |
| **Multiply** | Darkens by multiplying colors                   |
| **Screen**   | Lightens by inverting, multiplying, inverting   |
| **Overlay**  | Combines Multiply and Screen based on luminance |

### 🌈 Color Blend Modes

| Mode             | Description                            |
| ---------------- | -------------------------------------- |
| **Gamma (sRGB)** | Blend in perceptual gamma space        |
| **Linear**       | Convert to linear, blend, convert back |
| **HSV**          | Convert to HSV, blend, convert back    |

### 🔄 Canvas Transformations

- **Pan** (drag with middle mouse or two-finger gesture)
- **Zoom** (scroll wheel or pinch gesture)
- **Rotate** (Alt + drag)

### 📐 Coordinate System

The app uses a **fixed-size drawing canvas** (default 4000×4000 pixels) that is independent of the display size:

| Space            | Description                               |
| ---------------- | ----------------------------------------- |
| **Screen Space** | Mouse/touch coordinates in browser pixels |
| **NDC Space**    | Normalized Device Coordinates (-1 to 1)   |
| **Canvas Space** | Drawing canvas pixels (0 to 4000)         |

The coordinate transformation pipeline:

```
Screen → NDC → Undo Transform → Canvas
```

1. **Screen → NDC**: Convert screen position to -1..1 range
2. **Undo Pan**: Subtract normalized pan offset
3. **Undo Scale+Aspect**: Divide by display aspect correction and zoom
4. **Undo Rotation**: Apply inverse rotation matrix
5. **NDC → Canvas**: Map -1..1 to 0..4000 pixels

---

## Rendering Pipeline

### Pass 1: Brush Stroke Rendering

```
StrokePoints[] → Instanced Quads → Brush Render Texture
```

- Uses **instanced rendering** with up to 10,000 instances per batch
- Each instance is a textured quad with position, size, rotation, color, pressure
- Samples from GPU-generated brush texture for soft edges

### Pass 2: Blend Pass (TypeGPU)

```
Brush Texture + Canvas (Read) → Blend → Canvas (Write)
```

- Implements all blend modes in WGSL via TypeGPU functions
- Supports color space conversions (Gamma ↔ Linear ↔ HSV)
- Uses **ping-pong buffering** (SwapBuffer) for accumulation

### Pass 3: Display Pass

```
Canvas Texture → Transform → Screen Output
```

- Applies pan/zoom/rotate transformation matrix
- Uses **uniform scale** with separate aspect ratio correction to prevent rotation distortion
- Renders **checkerboard background** for transparency visualization
- Alpha-blends canvas over checkerboard

**Transform Matrix Structure:**

```
M = AspectCorrection × Rotation × Scale + Translation

where:
- Scale: Uniform zoom factor
- Rotation: 2D rotation matrix
- AspectCorrection: Adjusts for display vs canvas aspect ratio
- Translation: Pan offset in NDC space
```

---

## Key Components

### `BrushStroke.ts` (Full TypeGPU)

Manages brush stroke rendering using TypeGPU for data AND shaders.

```typescript
// TypeGPU for data management:
- Type-safe struct definitions (BrushInstance, BrushUniforms)
- Buffers with d.struct() and root.createBuffer()
- Textures with root['~unstable'].createTexture()

// TypeGPU shaders:
- Vertex shader: WGSL template with $uses() for bind group access
- Fragment shader: TypeScript function syntax with 'use gpu'
- TgpuRenderPipeline for type-safe pipeline
```

### `BrushTexture.ts` (Full TypeGPU)

Generates procedural brush textures on the GPU.

```typescript
// TypeGPU for data management:
- Uniform buffer with BrushParams struct
- Storage texture with TypeGPU

// TypeGPU compute shader:
- TypeScript function syntax with 'use gpu'
- Inline $.access to bind group members
- TgpuComputePipeline creation
```

### `BlendPass.ts` (Full TypeGPU)

Composites brush strokes onto canvas with blend modes.

```typescript
// TypeGPU features demonstrated:
- tgpu.fn() for reusable shader functions (color conversions, blend modes)
- tgpu.bindGroupLayout() for type-safe bindings
- tgpu['~unstable'].fragmentFn() with TypeScript 'use gpu' syntax
- Inline $.access to bind group layout members INSIDE shader function body
- std.textureSample(), std.pow(), std.clamp() for operations
```

### `DisplayPass.ts` (Full TypeGPU)

Final rendering to screen with canvas transformations.

```typescript
// TypeGPU for data management:
- Uniform buffer with mat4x4f transform matrix
- Buffer updates via uniformBuffer.write()

// TypeGPU shaders:
- Vertex shader: WGSL template (for local array declarations)
- Fragment shader: TypeScript 'use gpu' with checkerboard logic
- TgpuRenderPipeline creation
```

### `brush-shaders.ts` (TypeGPU Shaders)

Defines shared shaders for brush rendering.

```typescript
// TypeGPU bind group layout:
- Type-safe struct definitions (BrushInstance, BrushUniforms)
- Bind group layout with brushBindGroupLayout

// TypeGPU shaders:
- Vertex shader: WGSL template with $uses() for bind group access
- Fragment shader: TypeScript function syntax with 'use gpu'
```

### `SwapBuffer.ts`

Ping-pong buffer system for texture accumulation.

```typescript
// Two textures that swap roles:
- Read: Current accumulated canvas state
- Write: Target for next blend operation
- swap(): Exchanges read/write roles
```

### `usePointerInput.ts`

Handles pointer events and coordinate transformation.

```typescript
// Key function: screenToCanvas()
// Converts screen coordinates to fixed-size canvas coordinates
// by inverting the display transform matrix:

1. Screen position → NDC (-1 to 1)
2. Undo pan (in NDC space)
3. Undo aspect correction and scale
4. Undo rotation (transpose of rotation matrix)
5. NDC → Canvas pixels (0 to canvasWidth/Height)
```

---

## Full TypeGPU Approach

This example demonstrates a **full TypeGPU approach** where:

1. **TypeGPU handles data management**:
   - Type-safe struct definitions with `d.struct()`
   - Buffer creation with `root.createBuffer()`
   - Texture creation with `root['~unstable'].createTexture()`
   - Buffer unwrapping with `root.unwrap()` when needed for bind groups

2. **TypeGPU handles ALL shaders**:
   - **Vertex shaders**: WGSL template syntax with `$uses()` for bind group access
   - **Fragment shaders**: TypeScript function syntax with `'use gpu'`
   - **Compute shaders**: TypeScript function syntax with `'use gpu'`
   - `tgpu.fn()` for reusable GPU functions
   - Type-safe bind group layouts with `tgpu.bindGroupLayout()`

### TypeGPU Shader Patterns

#### Pattern 1: Vertex Shader (WGSL Template with `$uses()`)

Use WGSL templates for vertex shaders when you need local array declarations:

```typescript
// 1. Define bind group layout
const brushBindGroupLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: BrushUniforms },
  brushTexture: { texture: d.texture2d(d.f32) },
  texSampler: { sampler: 'filtering' },
  instances: { storage: BrushInstancesArray }
});

// 2. Vertex shader with WGSL template + $uses()
const brushVertexShader = tgpu['~unstable']
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex, instanceIndex: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, uv: d.vec2f, color: d.vec4f, pressure: d.f32 }
  })
  .$uses({ uniforms: brushBindGroupLayout.$.uniforms, instances: brushBindGroupLayout.$.instances })
  .does(/* wgsl */ `(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    // Local arrays work in WGSL templates
    var positions = array<vec2f, 6>(/* ... */);
    var uvs = array<vec2f, 6>(/* ... */);
    // Access bind group via uniforms and instances
    let instance = instances[instanceIndex];
    // ...
  }`);
```

#### Pattern 2: Fragment/Compute Shader (TypeScript Function Syntax)

Use TypeScript function syntax with `'use gpu'` for fragment and compute shaders:

```typescript
// Fragment shader with TypeScript syntax
const brushFragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f, color: d.vec4f, pressure: d.f32 },
  out: d.location(0, d.vec4f)
})(({ uv, color, pressure }) => {
  'use gpu';
  // Access bind group members INLINE inside the function
  const brushAlpha = std.textureSample(brushBindGroupLayout.$.brushTexture, brushBindGroupLayout.$.texSampler, uv).w;
  return d.vec4f(color.x, color.y, color.z, color.w * brushAlpha * pressure);
});

// Compute shader with TypeScript syntax
const brushComputeShader = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [8, 8, 1]
})(({ gid }) => {
  'use gpu';
  const params = brushComputeBindGroupLayout.$.params;
  // ... compute logic
  std.textureStore(brushComputeBindGroupLayout.$.outputTexture, coords, color);
});
```

#### Pattern 3: Reusable GPU Functions

Use `tgpu.fn()` for functions that can be called from shaders:

```typescript
const gammaToLinear = tgpu.fn(
  [d.vec3f],
  d.vec3f
)((color) => {
  'use gpu';
  return d.vec3f(std.pow(color.x, 2.2), std.pow(color.y, 2.2), std.pow(color.z, 2.2));
});

const multiplyBlend = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.vec3f
)((base, blend) => {
  'use gpu';
  return d.vec3f(base.x * blend.x, base.y * blend.y, base.z * blend.z);
});
```

### Creating Pipelines

```typescript
// Render pipeline
const pipeline = root['~unstable']
  .withVertex(vertexShader, {
    /* vertex buffers */
  })
  .withFragment(fragmentShader, { format: 'rgba8unorm' })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();

// Compute pipeline
const computePipeline = root['~unstable'].withCompute(computeShader).createPipeline();
```

### Creating Bind Groups

```typescript
// TypeGPU bind group (type-safe)
const bindGroup = root.createBindGroup(bindGroupLayout, {
  texSampler: sampler,
  brushTexture: texture,
  uniforms: root.unwrap(uniformBuffer) // unwrap for buffers
});

// Use with pipeline
pipeline.with(bindGroup).draw(vertexCount, instanceCount);
computePipeline.with(bindGroup).dispatchWorkgroups(x, y, z);
```

---

## Things to Pay Attention To

### 1. The `'use gpu'` Directive

⚠️ **TypeGPU shader functions using TypeScript syntax must have `'use gpu'` as the first statement:**

```typescript
// ✅ CORRECT - 'use gpu' at the start
const myShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f
})(({ uv }) => {
  'use gpu'; // Required!
  return d.vec4f(uv.x, uv.y, 0.0, 1.0);
});

// ❌ WRONG - Missing 'use gpu'
const badShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f
})(({ uv }) => {
  return d.vec4f(uv.x, uv.y, 0.0, 1.0); // Won't compile to WGSL!
});
```

### 2. TypeGPU `$` Accessor Placement

⚠️ **The `$` accessor must be used INSIDE the shader function body:**

```typescript
// ❌ WRONG - Will throw "Direct access to buffer values" error
const texture = blendBindGroupLayout.$.brushTexture; // Outside shader!
const shader = fragmentFn(...)(() => {
  std.textureSample(texture, ...);
});

// ✅ CORRECT - Access inline inside shader
const shader = fragmentFn(...)(() => {
  'use gpu';
  std.textureSample(blendBindGroupLayout.$.brushTexture, ...);
});
```

### 3. Vertex Shaders with Local Arrays

⚠️ **Use WGSL template syntax with `$uses()` for vertex shaders that need local arrays:**

```typescript
// ✅ CORRECT - WGSL template for array declarations
const vertexShader = tgpu['~unstable']
  .vertexFn({ in: {...}, out: {...} })
  .$uses({ uniforms: layout.$.uniforms })  // Access bind group via $uses
  .does(/* wgsl */ `(...) -> VertexOutput {
    var positions = array<vec2f, 6>(...);  // Local arrays work!
    let u = uniforms;  // Access from $uses
    // ...
  }`);

// Fragment/compute shaders use TypeScript function syntax
const fragmentShader = tgpu['~unstable'].fragmentFn({...})(({ ... }) => {
  'use gpu';
  // Access bind group inline with $
  std.textureSample(layout.$.texture, layout.$.sampler, uv);
});
```

### 4. Vector Component Access

⚠️ **Use `.x, .y, .z, .w` instead of `.r, .g, .b, .a` for swizzling:**

```typescript
// ❌ WRONG - .rgb and .a don't exist in TypeGPU types
const rgb = color.rgb;
const alpha = color.a;

// ✅ CORRECT - Use x, y, z, w components
const rgb = d.vec3f(color.x, color.y, color.z);
const alpha = color.w;
```

### 5. WGSL Variable Limitations

⚠️ **Textures/Samplers cannot be assigned to local variables in WGSL:**

```typescript
// ❌ WRONG - WGSL doesn't allow var for textures
const tex = blendBindGroupLayout.$.brushTexture;
std.textureSample(tex, ...); // Generates invalid WGSL!

// ✅ CORRECT - Use inline
std.textureSample(blendBindGroupLayout.$.brushTexture, ...);
```

### 6. Unwrapping TypeGPU Resources for Bind Groups

When creating bind groups, use `root.unwrap()` to get raw WebGPU resources from TypeGPU buffers:

```typescript
// TypeGPU bind group with unwrapped buffer
const bindGroup = root.createBindGroup(layout, {
  texSampler: sampler,
  brushTexture: texture,
  uniforms: root.unwrap(uniformBuffer) // Unwrap buffer
});

// Also works for textures when needed
const textureView = root.unwrap(texture).createView();
```

### 7. Texture Format Consistency

All render targets use `rgba8unorm` format defined in `constants.ts`:

```typescript
export const RENDER_TARGET_FORMAT: GPUTextureFormat = 'rgba8unorm';
```

### 8. Instanced Rendering Data Layout

Brush instances use a specific memory layout (48 bytes per instance):

```
position: vec2f (8 bytes)
size: f32 (4 bytes)
rotation: f32 (4 bytes)
color: vec4f (16 bytes)
pressure: f32 (4 bytes)
_padding: vec3f (12 bytes)
```

---

## Performance Considerations

### Batching

- Up to **10,000 brush instances** per draw call
- Instances are batched in CPU buffer, uploaded once per frame

### Texture Generation

- Brush textures are **pre-generated** when hardness changes
- Uses compute shader for fast GPU-side generation

### Swap Buffer

- Avoids texture copies by **swapping pointers**
- Only two textures allocated regardless of stroke count

### Render Loop

- Uses `requestAnimationFrame` with **dirty flag** (`needsRender`)
- Only renders when there are changes

### Memory Management

- Instance buffer pre-allocated to maximum size
- Textures destroyed and recreated on resize

---

## File Structure

```
typegpu-draw-app-example/
├── index.tsx              # Main SolidJS component
├── constants.ts           # Configuration (canvas size, formats, limits)
├── types.ts               # TypeScript interfaces & utilities
├── README.md              # This documentation
├── blend/
│   ├── BlendPass.ts      # Full TypeGPU blend compositing
│   └── SwapBuffer.ts     # Ping-pong texture management
├── brush/
│   ├── BrushStroke.ts    # Full TypeGPU: vertex WGSL + fragment 'use gpu'
│   ├── BrushTexture.ts   # Full TypeGPU: compute shader with 'use gpu'
│   └── brush-shaders.ts  # TypeGPU shaders (vertex WGSL + fragment 'use gpu')
├── canvas/
│   ├── useCanvasTransform.ts  # Pan/zoom/rotate hook
│   └── usePointerInput.ts     # Pointer events + coordinate transform
└── display/
    └── DisplayPass.ts    # Full TypeGPU: vertex WGSL + fragment 'use gpu'
```

### Key Constants (`constants.ts`)

```typescript
export const DEFAULT_CANVAS_WIDTH = 4000; // Fixed drawing canvas width
export const DEFAULT_CANVAS_HEIGHT = 4000; // Fixed drawing canvas height
export const MAX_INSTANCES = 10000; // Max brush instances per batch
export const RENDER_TARGET_FORMAT = 'rgba8unorm';
```

---

## Dependencies

- **typegpu** - Type-safe WebGPU abstraction
- **typegpu/data** - Data type definitions
- **typegpu/std** - Standard library functions
- **solid-js** - Reactive UI framework

---

## Usage

```tsx
import TypeGPUDrawApp from './typegpu-draw-app-example';

// In your app
<TypeGPUDrawApp />;
```

The app renders a full-screen canvas with brush controls. Draw by clicking/dragging, adjust settings with the UI panel.
