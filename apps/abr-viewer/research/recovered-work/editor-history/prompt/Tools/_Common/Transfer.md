# Transfer

Transfer controls how opacity and flow vary during a stroke, often called "paint dynamics" or "ink dynamics."

**Panel Checkbox:** Can be enabled/disabled for the brush
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Opacity Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in brush opacity

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off
- **See:** [Control Options](./Control-Options.md#roundness-jitter-control)

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Enabled When:** Control is NOT `Off`
- **Effect:** Minimum opacity when using dynamic control

---

### Flow Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in brush flow

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off
- **See:** [Control Options](./Control-Options.md#roundness-jitter-control)

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Enabled When:** Control is NOT `Off`
- **Effect:** Minimum flow when using dynamic control

---

### Wetness Jitter (Mixer Brush Tool Only)

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Availability:** Only enabled for Mixer Brush Tool
- **Disabled State:** Grayed out for all other tools
- **Effect:** Random variation in wetness

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%

---

### Mix Jitter (Mixer Brush Tool Only)

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Availability:** Only enabled for Mixer Brush Tool
- **Disabled State:** Grayed out for all other tools
- **Effect:** Random variation in mix amount

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%

## Opacity vs Flow

Understanding the difference:

| Property | Opacity                     | Flow                              |
| -------- | --------------------------- | --------------------------------- |
| Effect   | Overall stroke transparency | Paint "amount" per stamp          |
| Build-up | No build-up within stroke   | Builds up with overlapping stamps |
| Analogy  | Marker transparency         | Airbrush paint amount             |

### Visual Example

```
Opacity = 50%, Flow = 100%:
━━━━━━━━━━━━  (uniform 50% transparency, no build-up)

Opacity = 100%, Flow = 25%:
░░▒▒▓▓██████  (builds up from light to dark with slow painting)
```

## Conditional Logic Summary

```
Tool Type:
├── Brush Tool, Pencil Tool, etc.
│   └── Wetness Jitter: DISABLED
│       Mix Jitter: DISABLED
│
└── Mixer Brush Tool
    └── Wetness Jitter: ENABLED
        Mix Jitter: ENABLED

Opacity/Flow Control:
├── Off → Minimum: DISABLED
└── Any other → Minimum: ENABLED
```

## Implementation Notes

### Build-up Mode

The "Build-up" checkbox in the main brush settings affects how Transfer works:

- **Build-up OFF (default):** Stroke opacity caps at Opacity setting
- **Build-up ON:** Opacity can exceed initial setting with continued painting

### Pen Pressure Common Use

The most common Transfer setup:

- Opacity Control: Pen Pressure
- Flow Control: Off or Pen Pressure
  This gives natural pressure-sensitive painting.

### Warning Icon

Show warning triangle (⚠️) when Pen Pressure or Pen Tilt is selected but no tablet is detected.

### Mixer Brush Tool Integration

When implementing for Mixer Brush Tool:

- Wetness affects how much the brush picks up canvas color
- Mix affects the blend ratio between brush color and picked-up color
- These create realistic wet paint mixing effects
