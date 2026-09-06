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
2. Each mark is offset from the path by a random value up to `Scatter %` of brush diameter
3. If `Both Axes` is checked, offset in both X and Y; otherwise only perpendicular
4. Apply Control modulation to scatter distance

### Count Minimum

Count minimum is always 1 - you cannot have 0 brush marks.

### Performance Consideration

High Count values (8-16) with high Scatter can significantly impact performance.
