# Scattering

Scattering controls how brush marks are distributed perpendicular to the stroke path.

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `ZScattering`, `RoundnessControlType`
> **Descriptor Keys:** See [`src/descriptor-keys.ts`](../../src/descriptor-keys.ts) for `ScatteringKeys`

**Panel Checkbox:** Can be enabled/disabled for the brush  
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Scatter

- **Type:** Slider with numeric input
- **Range:** 0% - 1000%
- **Default:** 0%
- **ABR Key:** `scatter` (UntF #Prc)
- **Effect:** Distance brush marks scatter from stroke path
- **Slider Behavior:** LINEAR (unlike Size/Spacing)

#### Both Axes

- **Type:** Checkbox (inline with Scatter label)
- **Default:** Unchecked
- **ABR Key:** `bothAxes` (bool)
- **Effect When Checked:** Scatters in both X and Y directions
- **Effect When Unchecked:** Scatters only perpendicular to stroke direction

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation
- **TypeScript:** `RoundnessControlType`
- **ABR Key:** `scatterControl` (enum)
- **Default:** Off
- **See:** [Control Options](./control-options.md)

---

### Count

- **Type:** Slider with numeric input
- **Range:** 1 - 16
- **Default:** 1
- **ABR Key:** `count` (long)
- **Effect:** Number of brush marks per spacing interval

---

### Count Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `countJitter` (UntF #Prc)
- **Effect:** Random variation in count per interval

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation
- **TypeScript:** `RoundnessControlType`
- **ABR Key:** `countJitterControl` (enum)
- **Default:** Off

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts
export const ScatteringKeys = {
  useScatter: 'scatteringEnabled', // bool
  scatter: 'scatter', // UntF #Prc (0-1000%)
  scatterControl: 'scatterControl', // enum
  bothAxes: 'bothAxes', // bool
  count: 'count', // long (1-16)
  countJitter: 'countJitter', // UntF #Prc
  countJitterControl: 'countJitterControl' // enum
};
```

## Visual Behavior

### Scatter Effect

```
Scatter = 0%:    • • • • • • •  (marks on path)

Scatter = 100%:    •
                 •   •
                   •   •
                 •       •     (marks scattered from path)
```

### Both Axes Effect

```
Both Axes OFF:     •
                 •   •
                   •   •       (perpendicular scatter only)

Both Axes ON:    •     •
                   •
                 •   •   •     (scatter in all directions)
```

### Count Effect

```
Count = 1:  •   •   •   •      (one mark per interval)

Count = 3:  •   •   •   •
            •   •   •   •
            •   •   •   •      (three marks per interval)
```

## Implementation Notes

### Scatter Calculation

1. For each spacing interval, place `Count` brush marks
2. For the primary brush, `Scatter %` of the brush diameter is the full distribution width; each side extends half that distance
3. If `Both Axes` is checked, offset in both X and Y; otherwise only perpendicular
4. Apply Control modulation to scatter distance

### Count Minimum

The Count control has a minimum value of 1. Count Jitter can still produce a spacing interval with no marks. The sampler varies count on both sides of the selected value, rounds to an integer, and clamps the result to zero. For example, Count 3 with 100% jitter can emit 0–6 marks; 1% jitter still emits 3 marks at full pressure. Native Photoshop probes support this model; the exact random sequence is not reproduced.

### Sampled Smudge specialization

Primary sampled `SmTl` uses the separately recovered native path: Both Axes chooses radius and angle instead of independent square X/Y offsets. Its count starts at `trunc(1 + (Count - 1) × control)`; signed jitter is rounded and bounded by the truncated jitter amplitude before clamping count to zero. First-group handling also differs. Other tools and dual tips keep the model above. See [Wet Blender measurements](../../../abr-brush/fixtures/photoshop-wet-blender/README.md) for scope and remaining parity limits.

### Performance Consideration

High Count values (8-16) with high Scatter can significantly impact performance.
