# Brush Pose

Brush Pose allows manual override of stylus input values for tilt, rotation, and pressure. Useful for testing brush behavior or creating consistent strokes without a pressure-sensitive tablet.

**Panel Checkbox:** Can be enabled/disabled for the brush
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Tilt X

- **Type:** Slider with numeric input
- **Range:** -100% to 100%
- **Default:** 0%
- **Effect:** Simulates horizontal stylus tilt
- **Mapping:** -100% = full left tilt, 0% = vertical, 100% = full right tilt

#### Override Tilt X

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect When Checked:** Uses the Tilt X value instead of actual stylus tilt
- **Effect When Unchecked:** Uses actual stylus tilt input

---

### Tilt Y

- **Type:** Slider with numeric input
- **Range:** -100% to 100%
- **Default:** 0%
- **Effect:** Simulates vertical stylus tilt
- **Mapping:** -100% = tilted toward user, 0% = vertical, 100% = tilted away

#### Override Tilt Y

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect When Checked:** Uses the Tilt Y value instead of actual stylus tilt
- **Effect When Unchecked:** Uses actual stylus tilt input

---

### Rotation

- **Type:** Slider with numeric input
- **Range:** 0° to 360°
- **Default:** 0°
- **Effect:** Simulates barrel rotation of stylus
- **Note:** Shown in degrees, not percentage

#### Override Rotation

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect When Checked:** Uses the Rotation value instead of actual stylus rotation
- **Effect When Unchecked:** Uses actual stylus rotation input (if supported)

---

### Pressure

- **Type:** Slider with numeric input
- **Range:** 0% to 100%
- **Default:** 100%
- **Effect:** Simulates pen pressure

#### Override Pressure

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect When Checked:** Uses the Pressure value instead of actual pen pressure
- **Effect When Unchecked:** Uses actual pen pressure input

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

### UI Interaction

When override checkbox is unchecked:

- Slider should still be editable (changes won't take effect until override is checked)
- Some implementations gray out the slider when override is off
- Photoshop keeps slider fully editable

### Real-time Preview

The brush preview at bottom of Brush Settings panel should update immediately when:

- Override checkbox is toggled
- Slider values change (when override is active)
