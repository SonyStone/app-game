# Brush Pose

Brush Pose allows manual override of stylus input values for tilt, rotation, and pressure. Useful for testing brush behavior or creating consistent strokes without a pressure-sensitive tablet.

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `ZBrushPose`, `ZRotation`
> **Descriptor Keys:** See [`src/descriptor-keys.ts`](../../src/descriptor-keys.ts) for `BrushPoseKeys`

**Panel Checkbox:** Can be enabled/disabled for the brush  
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Tilt X

- **Type:** Slider with numeric input
- **Range:** -100% to 100%
- **Default:** 0%
- **ABR Key:** `tiltX` (value: -100 to 100)
- **Effect:** Simulates horizontal stylus tilt
- **Mapping:** -100% = full left tilt, 0% = vertical, 100% = full right tilt

#### Override Tilt X

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `overrideTiltX` (bool)
- **Effect When Checked:** Uses the Tilt X value instead of actual stylus tilt

---

### Tilt Y

- **Type:** Slider with numeric input
- **Range:** -100% to 100%
- **Default:** 0%
- **ABR Key:** `tiltY` (value: -100 to 100)
- **Effect:** Simulates vertical stylus tilt
- **Mapping:** -100% = tilted toward user, 0% = vertical, 100% = tilted away

#### Override Tilt Y

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `overrideTiltY` (bool)
- **Effect When Checked:** Uses the Tilt Y value instead of actual stylus tilt

---

### Rotation

- **Type:** Slider with numeric input
- **Range:** 0° to 360°
- **Default:** 0°
- **ABR Key:** `rotation` (value: 0 to 360)
- **TypeScript:** `ZRotation` (0-360°)
- **Effect:** Simulates barrel rotation of stylus

> ⚠️ **Note:** Brush Pose Rotation range is 0-360°, NOT the same as Brush Tip angle (-179 to 180°). See `ZRotation` vs `ZBrushAngle`.

#### Override Rotation

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `overrideRotation` (bool)
- **Effect When Checked:** Uses the Rotation value instead of actual stylus rotation

---

### Pressure

- **Type:** Slider with numeric input
- **Range:** 0% to 100%
- **Default:** 100%
- **ABR Key:** `pressure` (value: 0 to 100)
- **Effect:** Simulates pen pressure

#### Override Pressure

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `overridePressure` (bool)
- **Effect When Checked:** Uses the Pressure value instead of actual pen pressure

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts
export const BrushPoseKeys = {
  useBrushPose: 'brushPoseEnabled', // bool
  overrideTiltX: 'overrideTiltX', // bool
  tiltX: 'tiltX', // value: -100 to 100
  overrideTiltY: 'overrideTiltY', // bool
  tiltY: 'tiltY', // value: -100 to 100
  overrideRotation: 'overrideRotation', // bool
  rotation: 'rotation', // value: 0 to 360 degrees
  overridePressure: 'overridePressure', // bool
  pressure: 'pressure' // value: 0 to 100
};
```

## Use Cases

### Without Graphics Tablet

Override all values to simulate tablet input:

- Override Pressure: ON, Pressure: 50%
- Gives consistent "medium pressure" strokes with mouse

### Testing Brush Dynamics

Quickly test how brush responds to different inputs:

- Override Tilt X: ON, vary Tilt X slider
- See real-time brush changes without moving physical stylus

### Consistent Calligraphy

Lock specific rotation for consistent angled strokes:

- Override Rotation: ON, Rotation: 45°
- Every stroke has same calligraphic angle

### Inking with Fixed Size

Lock pressure for consistent line weight:

- Override Pressure: ON, Pressure: 100%
- Ignores hand pressure variation

## Relationship with Other Panels

Brush Pose overrides affect all dynamics that use stylus input:

| Setting  | Affects                                     |
| -------- | ------------------------------------------- |
| Tilt X/Y | Shape Dynamics (Pen Tilt), Brush Projection |
| Rotation | Any control using "Rotation" option         |
| Pressure | Any control using "Pen Pressure" option     |

## Implementation Notes

### Override Priority

```typescript
function getEffectivePressure(actualPressure: number, overridePressure: boolean, poseValue: number): number {
  return overridePressure ? poseValue / 100 : actualPressure;
}

function getEffectiveTiltX(
  actualTiltX: number, // -90 to 90 degrees from PointerEvent
  overrideTiltX: boolean,
  poseValue: number // -100 to 100 percent
): number {
  return overrideTiltX ? (poseValue / 100) * 90 : actualTiltX;
}
```

### Mouse Input Defaults

When using mouse (no tablet):

- Pressure defaults to 0.5 (per PointerEvent spec)
- Tilt defaults to 0
- Rotation defaults to 0

Brush Pose allows overriding these defaults for better mouse painting experience.

## Tool Availability

Brush Pose is NOT available for:

- Eraser Tool
- Blur Tool
- Smudge Tool
- Dodge Tool
- Burn Tool
- Sponge Tool
