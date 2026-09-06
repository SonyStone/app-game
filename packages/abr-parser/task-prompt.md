# Task: Implement Full Brush Settings Support in ABR Parser

## Context

The ABR parser (`/workspace/packages/abr-parser`) currently parses Adobe Photoshop brush files (.abr) and extracts basic brush properties. However, many advanced brush settings are stored in a generic `settings: Record<string, unknown>` object without proper typing.

The parser needs to be extended to fully support all brush settings panels documented in `/workspace/prompt/Tools/_Common/`.

## Current State

### What Works

- ABR file parsing (v6, v9, v10)
- Basic brush properties: `name`, `type`, `diameter`, `hardness`, `angle`, `roundness`, `spacing`
- Brush tip images (sampled brushes)
- Round-trip write/parse (114 tests passing)
- UUID-based sample matching

### What's Missing

The following settings are parsed into `settings` but not typed:

1. **Shape Dynamics** - Size/Angle/Roundness jitter, controls, minimums, tilt scale, flip jitter, brush projection
2. **Scattering** - Scatter amount, both axes, count, count jitter, controls
3. **Texture** - Pattern, scale, brightness, contrast, depth, texture each tip, blend mode, invert
4. **Dual Brush** - Second brush tip, blend mode, size, spacing, scatter, count
5. **Color Dynamics** - Apply per tip, FG/BG jitter, hue/saturation/brightness jitter, purity
6. **Transfer** - Opacity/flow jitter, controls, minimums, wetness/mix jitter (Mixer Brush)
7. **Brush Pose** - Override tilt X/Y, rotation, pressure with manual values
8. **Quick Toggles** - Noise, Wet Edges, Build-up, Smoothing, Protect Texture

## Reference Files

### Types & Keys

- `/workspace/packages/abr-parser/src/types.ts` - Zod schemas and TypeScript types
- `/workspace/packages/abr-parser/src/descriptor-keys.ts` - Mapping of Photoshop keys to human-readable names (NEW)

### Parser & Writer

- `/workspace/packages/abr-parser/src/abr-parser.ts` - Main parser
- `/workspace/packages/abr-parser/src/abr-writer.ts` - File writer
- `/workspace/packages/abr-parser/src/descriptor-parser.ts` - Descriptor parsing
- `/workspace/packages/abr-parser/src/descriptor-serializer.ts` - Descriptor serialization

### Documentation

- `/workspace/prompt/Tools/_Common/Shape-Dynamics.md`
- `/workspace/prompt/Tools/_Common/Scattering.md`
- `/workspace/prompt/Tools/_Common/Texture.md`
- `/workspace/prompt/Tools/_Common/Dual-Brush.md`
- `/workspace/prompt/Tools/_Common/Color-Dynamics.md`
- `/workspace/prompt/Tools/_Common/Transfer.md`
- `/workspace/prompt/Tools/_Common/Brush-Pose.md`
- `/workspace/prompt/Tools/_Common/Control-Options.md`
- `/workspace/prompt/Tools/_Common/Brush-Tip-Shape.md`

## Tasks

### 1. Extend Type Definitions (`types.ts`)

Add typed schemas for each brush settings panel:

```typescript
// Example structure - implement all panels similarly

export const ZShapeDynamics = z.object({
  enabled: z.boolean().default(false),
  sizeJitter: z
    .object({
      value: ZPercent,
      control: SizeControlType,
      fadeSteps: z.number().int().min(1).max(9999).optional(),
      minimumDiameter: ZPercent.optional(),
      tiltScale: z.number().min(0).max(200).optional() // Only when control is 'penTilt'
    })
    .optional(),
  angleJitter: z
    .object({
      value: ZPercent,
      control: AngleControlType,
      fadeSteps: z.number().int().min(1).max(9999).optional()
    })
    .optional(),
  roundnessJitter: z
    .object({
      value: ZPercent,
      control: RoundnessControlType,
      fadeSteps: z.number().int().min(1).max(9999).optional(),
      minimumRoundness: ZPercent.optional()
    })
    .optional(),
  flipXJitter: z.boolean().default(false),
  flipYJitter: z.boolean().default(false),
  brushProjection: z.boolean().default(false)
});

export const ZScattering = z.object({
  enabled: z.boolean().default(false),
  scatter: ZPercent, // 0-1000%
  bothAxes: z.boolean().default(false),
  control: RoundnessControlType,
  fadeSteps: z.number().int().min(1).max(9999).optional(),
  count: z.number().int().min(1).max(16).default(1),
  countJitter: z
    .object({
      value: ZPercent,
      control: RoundnessControlType,
      fadeSteps: z.number().int().min(1).max(9999).optional()
    })
    .optional()
});

// Continue for: ZTexture, ZDualBrush, ZColorDynamics, ZTransfer, ZBrushPose, ZQuickToggles
```

Update the `ZBrush` schema:

```typescript
export const ZBrush = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: BrushType,

  // Brush Tip Shape
  spacing: ZPercent,
  diameter: ZPixels.optional(),
  hardness: ZPercent.optional(),
  angle: ZDegrees.optional(),
  roundness: ZPercent.optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),

  // Brush tip image (sampled brushes)
  brushTip: ZBrushTipImage.optional(),
  sampledDataUuid: z.string().optional(),

  // Settings panels
  shapeDynamics: ZShapeDynamics.optional(),
  scattering: ZScattering.optional(),
  texture: ZTexture.optional(),
  dualBrush: ZDualBrush.optional(),
  colorDynamics: ZColorDynamics.optional(),
  transfer: ZTransfer.optional(),
  brushPose: ZBrushPose.optional(),

  // Quick toggles
  noise: z.boolean().optional(),
  wetEdges: z.boolean().optional(),
  buildUp: z.boolean().optional(),
  smoothing: z.boolean().optional(),
  protectTexture: z.boolean().optional(),

  // Raw settings for forward compatibility
  settings: z.record(z.string(), z.unknown())
});
```

### 2. Update Parser (`abr-parser.ts`)

Modify `createBrush()` to extract typed settings:

```typescript
private createBrush(...): Brush | null {
  // ... existing code ...

  // Extract shape dynamics
  const shapeDynamics = this.extractShapeDynamics(desc);

  // Extract scattering
  const scattering = this.extractScattering(desc);

  // ... etc for all panels

  const brush: Brush = {
    // ... existing fields ...
    shapeDynamics,
    scattering,
    texture,
    dualBrush,
    colorDynamics,
    transfer,
    brushPose,
    noise: getBoolean(desc, 'useNoise'),
    wetEdges: getBoolean(desc, 'wetEdges'),
    buildUp: getBoolean(desc, 'Arbrsh'),
    smoothing: getBoolean(desc, 'useSmoothing'),
    protectTexture: getBoolean(desc, 'protectTexture'),
    settings: this.options.includeRawSettings ? this.flattenDescriptor(desc) : {},
  };
}

private extractShapeDynamics(desc: Record<string, DescriptorValue>): ShapeDynamics | undefined {
  const enabled = getBoolean(desc, 'useTipDynamics');
  if (!enabled) return undefined;

  return {
    enabled: true,
    sizeJitter: {
      value: getNumber(desc, 'szJt') ?? 0,
      control: this.mapControlType(desc, 'sizeJitterControl'),
      minimumDiameter: getNumber(desc, 'minDiameter'),
      tiltScale: getNumber(desc, 'tiltScale'),
    },
    // ... continue for all fields
  };
}

private mapControlType(desc: Record<string, DescriptorValue>, key: string): string {
  const value = desc[key];
  if (value?.type === 'enum') {
    return ControlTypeValues[value.value] ?? 'off';
  }
  return 'off';
}
```

### 3. Update Writer (`abr-writer.ts`)

Modify `createBrushDescriptor()` to serialize typed settings:

```typescript
private createBrushDescriptor(brush: Brush, uuid?: string): Record<string, DescriptorValue> {
  const desc: Record<string, DescriptorValue> = {};

  // ... existing code ...

  // Shape Dynamics
  if (brush.shapeDynamics?.enabled) {
    desc['useTipDynamics'] = makeDescriptor.bool(true);
    if (brush.shapeDynamics.sizeJitter) {
      desc['szJt'] = makeDescriptor.unit('#Prc', brush.shapeDynamics.sizeJitter.value);
      // ... serialize all fields
    }
  }

  // ... continue for all panels
}
```

### 4. Add Helper Functions to `descriptor-parser.ts`

Add specialized extraction helpers:

```typescript
export function getEnum(desc: Record<string, DescriptorValue>, key: string): string | undefined {
  const value = desc[key];
  if (value?.type === 'enum') {
    return value.value;
  }
  return undefined;
}

export function getUnit(
  desc: Record<string, DescriptorValue>,
  key: string
): { unit: string; value: number } | undefined {
  const value = desc[key];
  if (value?.type === 'UntF') {
    return { unit: value.unit, value: value.value };
  }
  return undefined;
}
```

### 5. Update Tests (`tests/abr-parser.test.ts`)

Add tests for typed settings extraction:

```typescript
describe('Brush Settings Extraction', () => {
  test('should extract shape dynamics from brush', () => {
    const parser = new AbrParser();
    const result = parser.parseFile(path.join(FILES_DIR, 'Brushes To Implement.abr'));

    const brushWithDynamics = result.brushes.find((b) => b.shapeDynamics?.enabled);
    expect(brushWithDynamics).toBeDefined();
    expect(brushWithDynamics!.shapeDynamics!.sizeJitter).toBeDefined();
  });

  // Add tests for all panels...
});
```

### 6. Export New Types and Keys

Update `/workspace/packages/abr-parser/src/index.ts`:

```typescript
export * from './types';
export * from './descriptor-keys';
export { AbrParser } from './abr-parser';
export { AbrWriter, createAbrFile, createBrush, createBrushTip } from './abr-writer';
export { ImageExporter } from './image-exporter';
```

## Validation

1. All existing tests must pass
2. New round-trip tests should preserve typed settings
3. Parse `Brushes To Implement.abr` and verify all settings are extracted
4. Compare parsed values against Photoshop's brush settings panel

## Notes

- Use `descriptor-keys.ts` for key mappings to keep parser code clean
- Preserve raw `settings` object for forward compatibility with unknown fields
- Control types vary by setting - see `types.ts` for `SizeControlType`, `AngleControlType`, `RoundnessControlType`
- **Angle types are different:**
  - `ZBrushAngle` / `BrushAngle`: -179 to 180 degrees (Brush Tip Shape angle)
  - `ZRotation` / `Rotation`: 0 to 360 degrees (Brush Pose rotation)
- Some settings like Tilt Scale only apply when specific controls are selected

## Test File

Use `Brushes To Implement.abr` as the primary test file - it contains examples of all brush settings.
