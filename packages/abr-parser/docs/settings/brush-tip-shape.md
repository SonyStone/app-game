# Brush Tip Shape

The Brush Tip Shape panel defines the fundamental shape and behavior of the brush tip.

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `ZBrush`, `BrushType`, `ZBrushAngle`
> **Descriptor Keys:** See [`src/descriptor-keys.ts`](../../src/descriptor-keys.ts) for `BrushDefinitionKeys`

## Brush Tip Types

```typescript
// From src/types.ts
export const BrushType = z.enum(['computed', 'sampled']);
```

| Type       | Description                                | Hardness Control      |
| ---------- | ------------------------------------------ | --------------------- |
| `sampled`  | Bitmap image as brush tip                  | Disabled (grayed out) |
| `computed` | Generated mathematically (hard/soft round) | Enabled               |

## Settings

### Size (Diameter)

- **Type:** Slider with numeric input
- **Range:** 1 - 5000 px
- **Default:** Varies per brush
- **ABR Key:** `Dmtr` (UntF #Pxl)
- **TypeScript:** `ZBrush.diameter`

#### Non-Linear Size Slider Mapping

| Slider Position | Pixel Range   |
| --------------- | ------------- |
| 0% - 50%        | 1 - 100 px    |
| 50% - 75%       | 100 - 200 px  |
| 75% - 87.5%     | 200 - 500 px  |
| 87.5% - 100%    | 500 - 5000 px |

### Flip X

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `flipX` (bool)
- **TypeScript:** `ZBrush.flipX`

### Flip Y

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `flipY` (bool)
- **TypeScript:** `ZBrush.flipY`

### Angle

- **Type:** Numeric input with scrubby slider
- **Range:** -179° to 180°
- **Default:** 0°
- **ABR Key:** `Angl` (UntF #Ang)
- **TypeScript:** `ZBrushAngle` (-179 to 180)

> ⚠️ **Note:** Brush angle range is -179 to 180°, NOT 0 to 360°. See `ZBrushAngle` type.

### Roundness

- **Type:** Numeric input with scrubby slider
- **Range:** 1% - 100%
- **Default:** 100%
- **ABR Key:** `Rndn` (UntF #Prc)
- **TypeScript:** `ZBrush.roundness`

### Hardness

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 100%
- **ABR Key:** `Hrdn` (UntF #Prc)
- **TypeScript:** `ZBrush.hardness`
- **Availability:** Only for **computed brushes**

### Spacing

- **Type:** Checkbox + Slider with numeric input
- **Checkbox Default:** Checked
- **Range:** 1% - 1000%
- **Default:** 25% (varies per brush)
- **ABR Key:** `Spcn` (UntF #Prc)
- **TypeScript:** `ZBrush.spacing`

#### Non-Linear Spacing Slider Mapping

| Slider Position | Spacing Range |
| --------------- | ------------- |
| 0% - 50%        | 1% - 100%     |
| 50% - 75%       | 100% - 200%   |
| 75% - 87.5%     | 200% - 500%   |
| 87.5% - 100%    | 500% - 1000%  |

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts
export const BrushDefinitionKeys = {
  brTp: 'brushType', // enum: 'brtC' = computed, 'brtS' = sampled
  Dmtr: 'diameter', // UntF #Pxl
  Hrdn: 'hardness', // UntF #Prc - computed brushes only
  Angl: 'angle', // UntF #Ang - Range: -179 to 180
  Rndn: 'roundness', // UntF #Prc
  Spcn: 'spacing', // UntF #Prc
  Intr: 'interpolation', // bool
  flipX: 'flipX', // bool
  flipY: 'flipY', // bool
  sampledData: 'sampledDataUuid' // TEXT - UUID reference to brush tip image
};
```

## Implementation Notes

### Computed vs Sampled Brush Detection

```typescript
// Hardness slider visibility
const showHardness = brush.type === 'computed';
```

### Spacing Behavior

When spacing checkbox is unchecked:

- Brush stamps are placed based on cursor movement speed
- Faster movement = more spacing
- This creates a more natural, variable stroke
