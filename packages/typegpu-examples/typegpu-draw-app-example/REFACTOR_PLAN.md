# TypeGPU Drawing Framework - Refactoring Plan

## Goal

Transform the current drawing app into a **modular, composable drawing framework** where:

1. **Each concern is isolated** - brushes, blending, canvas management, input handling, UI
2. **Easy experimentation** - swap brushes, blend modes, input methods without touching core code
3. **Plugin-like architecture** - add new features by registering modules
4. **Declarative configuration** - configure the drawing engine via simple objects/configs

---

## Current Pain Points

### 1. **Monolithic `index.tsx`** (~500 lines)

- Mixes UI, state management, GPU initialization, render loop
- Hard to understand the flow
- Can't easily reuse parts

### 2. **Tightly Coupled Components**

- `BrushStroke` has hardcoded shader behavior
- `BlendPass` contains ALL blend mode logic in one file
- No way to add custom brushes without modifying core files

### 3. **State Management Scattered**

- Brush settings in `index.tsx`
- Transform state in `index.tsx`
- Stroke state (in-progress, pending points) in `index.tsx`
- No centralized state container

### 4. **Input Handling Mixed with Logic**

- `usePointerInput.ts` does: event handling + coordinate transform + interpolation
- Hard to swap input methods (e.g., tablet vs mouse vs touch gestures)

### 5. **No Clear Extension Points**

- Can't add new brush types without modifying `BrushStroke`
- Can't add new blend modes without modifying `BlendPass`
- No lifecycle hooks for plugins

---

## Proposed Architecture

```
typegpu-draw-framework/
├── core/                      # Core engine (rarely modified)
│   ├── DrawingEngine.ts       # Main orchestrator
│   ├── RenderLoop.ts          # requestAnimationFrame management
│   ├── GPUContext.ts          # WebGPU initialization wrapper
│   └── types.ts               # Core type definitions
│
├── canvas/                    # Canvas & compositing (rarely modified)
│   ├── Canvas.ts              # Drawing canvas abstraction
│   ├── SwapBuffer.ts          # Ping-pong buffer (existing)
│   ├── DisplayPass.ts         # Screen rendering (existing, cleaned up)
│   └── Compositor.ts          # Layer compositing (new)
│
├── input/                     # Input handling (modular)
│   ├── InputManager.ts        # Input orchestrator
│   ├── PointerInput.ts        # Mouse/touch drawing
│   ├── NavigationInput.ts     # Pan/zoom/rotate (separated!)
│   ├── KeyboardInput.ts       # Keyboard shortcuts
│   └── GestureInput.ts        # Multi-touch gestures
│
├── brushes/                   # Brush system (easily extensible!)
│   ├── BrushRegistry.ts       # Register/get brushes by name
│   ├── BaseBrush.ts           # Abstract brush interface
│   ├── brushes/               # Individual brush implementations
│   │   ├── SoftRoundBrush.ts  # Current brush (extracted)
│   │   ├── HardRoundBrush.ts  # Simple hard brush
│   │   ├── TextureBrush.ts    # Image-based brush
│   │   └── ScatterBrush.ts    # Randomized placement
│   └── BrushStroke.ts         # Brush rendering (uses registered brush)
│
├── blend/                     # Blend modes (easily extensible!)
│   ├── BlendRegistry.ts       # Register/get blend modes
│   ├── BlendMode.ts           # Blend mode interface
│   ├── modes/                 # Individual blend implementations
│   │   ├── NormalBlend.ts
│   │   ├── MultiplyBlend.ts
│   │   ├── ScreenBlend.ts
│   │   └── OverlayBlend.ts
│   └── BlendPass.ts           # Blend rendering (uses registered modes)
│
├── state/                     # Centralized state management
│   ├── DrawingState.ts        # All drawing state in one place
│   ├── ToolState.ts           # Current tool, brush settings
│   ├── CanvasState.ts         # Transform, zoom, pan
│   └── HistoryState.ts        # Undo/redo (future)
│
├── ui/                        # UI components (completely separate)
│   ├── Toolbar.tsx            # Tool selection
│   ├── BrushSettings.tsx      # Brush controls
│   ├── ColorPicker.tsx        # Color selection
│   ├── BlendModeSelector.tsx  # Blend mode dropdown
│   └── CanvasView.tsx         # Canvas container
│
├── presets/                   # Pre-configured setups
│   ├── SimpleDrawApp.ts       # Minimal setup
│   ├── FullDrawApp.ts         # Full-featured setup
│   └── CustomizableApp.ts     # Builder pattern
│
└── index.ts                   # Main export
```

---

## Key Interfaces

### 1. Drawing Engine (Core Orchestrator)

```typescript
interface DrawingEngineConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  brushes?: BrushDefinition[];
  blendModes?: BlendModeDefinition[];
  inputHandlers?: InputHandler[];
}

class DrawingEngine {
  // Lifecycle
  async init(config: DrawingEngineConfig): Promise<void>;
  destroy(): void;

  // State access
  get state(): DrawingState;
  get canvas(): Canvas;

  // Extension
  registerBrush(brush: BrushDefinition): void;
  registerBlendMode(mode: BlendModeDefinition): void;
  registerInputHandler(handler: InputHandler): void;

  // Events
  on(event: 'strokeStart' | 'strokeEnd' | 'render', callback: Function): void;
}
```

### 2. Brush Interface (Extensible)

```typescript
interface BrushDefinition {
  id: string;
  name: string;

  // Texture generation (optional - can use default)
  generateTexture?(hardness: number): GPUTexture;

  // Shader customization (optional)
  fragmentShader?: TgpuFragmentShader;

  // Settings schema (for UI generation)
  settings: BrushSettingsSchema;

  // Point processing (spacing, jitter, etc.)
  processPoints?(points: StrokePoint[], settings: BrushSettings): StrokeInstance[];
}

// Example usage:
const softRoundBrush: BrushDefinition = {
  id: 'soft-round',
  name: 'Soft Round',
  settings: {
    size: { min: 1, max: 500, default: 20 },
    opacity: { min: 0, max: 1, default: 1 },
    hardness: { min: 0, max: 1, default: 0.5 },
    spacing: { min: 1, max: 100, default: 25 }
  }
};
```

### 3. Blend Mode Interface (Extensible)

```typescript
interface BlendModeDefinition {
  id: string;
  name: string;

  // The GPU function for blending
  blendFn: TgpuFn<[d.vec4f, d.vec4f], d.vec4f>;
}

// Example - adding a custom blend mode:
const dissolveBlend: BlendModeDefinition = {
  id: 'dissolve',
  name: 'Dissolve',
  blendFn: tgpu.fn(
    [d.vec4f, d.vec4f],
    d.vec4f
  )((src, dst) => {
    'use gpu';
    // Custom dissolve logic...
  })
};
```

### 4. Input Handler Interface

```typescript
interface InputHandler {
  id: string;

  // Lifecycle
  attach(canvas: HTMLCanvasElement, engine: DrawingEngine): void;
  detach(): void;

  // Optional: conflict resolution with other handlers
  priority?: number;
  blocksOthers?: boolean;
}
```

---

## Refactoring Steps

### Phase 1: Core Infrastructure (Foundation)

1. [ ] Create `core/GPUContext.ts` - WebGPU init wrapper
2. [ ] Create `core/RenderLoop.ts` - Animation frame management
3. [ ] Create `state/DrawingState.ts` - Centralized state
4. [ ] Create `core/DrawingEngine.ts` - Main orchestrator

### Phase 2: Extract & Modularize Existing Code

5. [ ] Extract `canvas/Canvas.ts` from SwapBuffer + display logic
6. [ ] Split `usePointerInput.ts` into `PointerInput.ts` + `NavigationInput.ts`
7. [ ] Create `brushes/BrushRegistry.ts` + `BaseBrush.ts` interface
8. [ ] Extract current brush as `brushes/brushes/SoftRoundBrush.ts`
9. [ ] Create `blend/BlendRegistry.ts` + extract modes to separate files

### Phase 3: UI Separation

10. [ ] Create `ui/CanvasView.tsx` - Just the canvas element
11. [ ] Create `ui/BrushSettings.tsx` - Brush controls
12. [ ] Create `ui/Toolbar.tsx` - Tool/mode selection
13. [ ] Create `ui/ColorPicker.tsx` - Color selection

### Phase 4: Presets & Examples

14. [ ] Create `presets/SimpleDrawApp.ts` - Minimal example
15. [ ] Create `presets/FullDrawApp.ts` - Full-featured example
16. [ ] Update `index.tsx` to use new architecture

### Phase 5: Documentation & Polish

17. [ ] Update README with new architecture
18. [ ] Add JSDoc to all public interfaces
19. [ ] Create examples for extending brushes/blend modes

---

## Benefits After Refactoring

### For Experimentation:

- **Add new brush**: Create one file in `brushes/brushes/`, register it
- **Add new blend mode**: Create one file in `blend/modes/`, register it
- **Change input behavior**: Modify one input handler, others unaffected
- **Custom UI**: Replace entire UI folder without touching engine

### For Understanding:

- Clear separation of concerns
- Each file does ONE thing
- Easy to trace data flow

### For Maintenance:

- Changes isolated to specific modules
- Tests can target specific modules
- Easy to identify bugs by module

---

## Questions to Consider

1. **State Management**: Should we use SolidJS signals throughout, or have a framework-agnostic core state?
   - Recommendation: Framework-agnostic core with SolidJS bindings for UI

2. **Shader Customization**: How much shader customization should brushes allow?
   - Recommendation: Allow full fragment shader override, but provide good defaults

3. **Layer Support**: Should we add layer support now or later?
   - Recommendation: Design for it (Compositor), implement later

4. **History/Undo**: Priority for undo/redo?
   - Recommendation: Design state for it, implement in Phase 5+

---

## File Size Targets

| Current File         | Lines | Target After Refactor    |
| -------------------- | ----- | ------------------------ |
| `index.tsx`          | ~500  | ~100 (just wiring)       |
| `BrushStroke.ts`     | ~300  | ~150 (generic rendering) |
| `BlendPass.ts`       | ~400  | ~150 (generic blending)  |
| `usePointerInput.ts` | ~400  | ~150 (just pointer)      |
| `DisplayPass.ts`     | ~300  | ~200 (cleaned up)        |

New files will be ~50-150 lines each, focused on single concerns.

---

## Next Steps

1. Review this plan - any concerns or changes?
2. Start with Phase 1 (Core Infrastructure)
3. Incremental refactoring - app stays working at each step
