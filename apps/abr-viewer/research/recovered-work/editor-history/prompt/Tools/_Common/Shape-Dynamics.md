# Shape Dynamics

Shape Dynamics control how the brush tip's size, angle, and roundness vary during a stroke.

**Panel Checkbox:** Can be enabled/disabled for the brush
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Size Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in brush size

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel]
- **Default:** Off
- **See:** [Control Options](./Control-Options.md)

#### Minimum Diameter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Enabled When:** Control is NOT `Off`
- **Disabled When:** Control is `Off`
- **Effect:** Sets the minimum size as percentage of brush diameter

#### Tilt Scale

- **Type:** Slider with numeric input
- **Range:** 0% - 200%
- **Default:** 100%
- **Enabled When:** Control is `Pen Tilt`
- **Disabled When:** Control is anything else
- **Effect:** Scales the tilt effect on size

---

### Angle Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in brush angle

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation, Initial Direction, Direction]
- **Default:** Off
- **See:** [Control Options](./Control-Options.md#angle-jitter-control)

---

### Roundness Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in brush roundness

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off
- **See:** [Control Options](./Control-Options.md#roundness-jitter-control)

#### Minimum Roundness

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 25%
- **Enabled When:** Control is NOT `Off` OR Roundness Jitter > 0%
- **Effect:** Sets the minimum roundness value

---

### Flip X Jitter

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** Randomly flips brush horizontally during stroke

### Flip Y Jitter

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** Randomly flips brush vertically during stroke

---

### Brush Projection

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** Projects brush based on pen tilt for 3D-like effect
- **Side Effect:** When enabled, disables Roundness Jitter controls

## Conditional Logic Summary

```
Size Jitter Control:
├── Off → Minimum Diameter: DISABLED, Tilt Scale: DISABLED
├── Fade → Minimum Diameter: ENABLED, Tilt Scale: DISABLED, Show Steps input
├── Pen Pressure → Minimum Diameter: ENABLED, Tilt Scale: DISABLED
├── Pen Tilt → Minimum Diameter: ENABLED, Tilt Scale: ENABLED
└── Stylus Wheel → Minimum Diameter: ENABLED, Tilt Scale: DISABLED

Brush Projection:
├── Checked → Roundness Jitter: DISABLED, Roundness Control: DISABLED, Min Roundness: DISABLED
└── Unchecked → All roundness controls: ENABLED
```

## Implementation Notes

### Jitter Calculation

Jitter values represent the maximum random deviation:

- 0% = no variation
- 50% = varies between 50% and 100% of base value
- 100% = varies between 0% and 100% of base value

### Control + Jitter Combination

When both a Control and Jitter value are set:

1. Control determines the base multiplier (e.g., pressure = 0.7)
2. Jitter adds random variation on top
3. Final value = base × control × (1 - random × jitter)
