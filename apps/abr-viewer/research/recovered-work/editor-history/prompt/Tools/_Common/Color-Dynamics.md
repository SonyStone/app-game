# Color Dynamics

Color Dynamics control how color varies during a stroke, shifting between foreground/background colors and varying HSB values.

**Panel Checkbox:** Can be enabled/disabled for the brush
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Apply Per Tip

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect When Checked:** Color varies for each brush mark
- **Effect When Unchecked:** Color varies smoothly across the stroke

---

### Foreground/Background Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation between foreground and background colors

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off
- **See:** [Control Options](./Control-Options.md#roundness-jitter-control)

---

### Hue Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in hue
- **Note:** No Control dropdown (pure random only)

---

### Saturation Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in saturation
- **Note:** No Control dropdown (pure random only)

---

### Brightness Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in brightness
- **Note:** No Control dropdown (pure random only)

---

### Purity

- **Type:** Slider with numeric input
- **Range:** -100% to 100%
- **Default:** 0%
- **Effect:**
  - Positive values: Increases saturation (more vivid)
  - Negative values: Decreases saturation (more muted)
  - Acts as a saturation bias/offset

## Visual Examples

### Foreground/Background Jitter

```
FG = Blue, BG = Yellow, Jitter = 0%:
████████████████  (all blue)

FG = Blue, BG = Yellow, Jitter = 100%:
██▓▓██▓▓▓▓██▓▓██  (random mix of blue and yellow)
```

### Hue Jitter

```
Base = Red, Hue Jitter = 0%:
████████████████  (all red)

Base = Red, Hue Jitter = 20%:
██▓▓██▒▒██░░██▓▓  (red with slight orange/magenta variations)
```

### Apply Per Tip Effect

```
Apply Per Tip = OFF:
Smooth gradient transitions between color variations

Apply Per Tip = ON:
Each brush stamp can be a completely different color
```

## Color Inclusion in Brush Presets

Brushes can optionally include color settings:

- **Include Color** option when saving brush preset
- Stores foreground color with the brush
- Available for: Brush Tool, Pencil Tool, Mixer Brush Tool

## Implementation Notes

### HSB Color Space

Color dynamics operate in HSB (Hue, Saturation, Brightness) color space:

- Hue: 0-360° color wheel position
- Saturation: 0-100% color intensity
- Brightness: 0-100% lightness

### Jitter Calculations

```typescript
// Hue jitter (wraps around)
newHue = (baseHue + (random() - 0.5) * 360 * hueJitter) % 360;

// Saturation jitter (clamped)
newSat = clamp(baseSat + (random() - 0.5) * 100 * satJitter, 0, 100);

// Brightness jitter (clamped)
newBright = clamp(baseBright + (random() - 0.5) * 100 * brightJitter, 0, 100);

// Purity offset (applied to saturation)
finalSat = clamp(newSat + purity, 0, 100);
```

### Foreground/Background Interpolation

```typescript
// FG/BG jitter with control
const fgbgRatio = getControlValue(control, pressure, tilt, etc);
const jitteredRatio = fgbgRatio + (random() - 0.5) * fgbgJitter;
const finalColor = lerpColor(foreground, background, jitteredRatio);
```

### Tool Availability

Color Dynamics is NOT available for:

- Clone Stamp Tool (uses sampled colors)
- Healing tools
- Any tool that doesn't apply foreground/background colors directly
