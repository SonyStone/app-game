# Color Dynamics

Color Dynamics control how color varies during a stroke, shifting between foreground/background colors and varying HSB values.

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `ZColorDynamics`, `RoundnessControlType`
> **Descriptor Keys:** See [`src/descriptor-keys.ts`](../../src/descriptor-keys.ts) for `ColorDynamicsKeys`

**Panel Checkbox:** Can be enabled/disabled for the brush  
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Apply Per Tip

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `applyPerTip` (bool)
- **Effect When Checked:** Color varies for each brush mark
- **Effect When Unchecked:** Color varies smoothly across the stroke

---

### Foreground/Background Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `fgBgJitter` (UntF #Prc)
- **Effect:** Random variation between foreground and background colors

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation
- **TypeScript:** `RoundnessControlType`
- **ABR Key:** `fgBgJitterControl` (enum)
- **Default:** Off

---

### Hue Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `hueJitter` (UntF #Prc)
- **Effect:** Random variation in hue
- **Note:** No Control dropdown (pure random only)

---

### Saturation Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `satJitter` (UntF #Prc)
- **Effect:** Random variation in saturation
- **Note:** No Control dropdown (pure random only)

---

### Brightness Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `briJitter` (UntF #Prc)
- **Effect:** Random variation in brightness
- **Note:** No Control dropdown (pure random only)

---

### Purity

- **Type:** Slider with numeric input
- **Range:** -100% to 100%
- **Default:** 0%
- **ABR Key:** `purity` (long: -100 to 100)
- **Effect:**
  - Positive values: Increases saturation (more vivid)
  - Negative values: Decreases saturation (more muted)
  - Acts as a saturation bias/offset

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts
export const ColorDynamicsKeys = {
  useColorDynamics: 'colorDynamicsEnabled', // bool
  applyPerTip: 'applyPerTip', // bool
  fgBgJitter: 'foregroundBackgroundJitter', // UntF #Prc
  fgBgJitterControl: 'foregroundBackgroundJitterControl', // enum
  hueJitter: 'hueJitter', // UntF #Prc
  satJitter: 'saturationJitter', // UntF #Prc
  briJitter: 'brightnessJitter', // UntF #Prc
  purity: 'purity' // long (-100 to 100)
};
```

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

Brushes can optionally include color settings when saved:

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

## Tool Availability

Color Dynamics is NOT available for:

- Mixer Brush Tool
- Blur Tool
- Smudge Tool
- Dodge Tool
- Burn Tool
- Sponge Tool
