# Blur Tool

The Blur Tool softens/blurs pixels by reducing contrast between adjacent pixels. Part of the Focus tools group (Blur, Sharpen, Smudge).

## Toolbar Options

| Option            | Type     | Range/Values                                                | Default | Notes                            |
| ----------------- | -------- | ----------------------------------------------------------- | ------- | -------------------------------- |
| Mode              | Dropdown | Normal, Darken, Lighten, Hue, Saturation, Color, Luminosity | Normal  | Limited blend mode set           |
| Strength          | Slider   | 1-100%                                                      | 50%     | Intensity of blur effect         |
| Angle             | Input    | 0-360°                                                      | 0°      | Brush rotation angle             |
| Sample All Layers | Checkbox | On/Off                                                      | Off     | Blur based on all visible layers |

### Mode Options (Focus Tools Subset)

| Mode       | Description                                    |
| ---------- | ---------------------------------------------- |
| Normal     | Blurs all color channels equally               |
| Darken     | Only blurs pixels lighter than brush area      |
| Lighten    | Only blurs pixels darker than brush area       |
| Hue        | Blurs only hue values                          |
| Saturation | Blurs only saturation values                   |
| Color      | Blurs hue and saturation, preserves luminosity |
| Luminosity | Blurs only luminosity, preserves color         |

---

## Brush Settings Panel Availability

| Panel           | Status      | Notes                                |
| --------------- | ----------- | ------------------------------------ |
| Brush Tip Shape | ✅          | Full options                         |
| Shape Dynamics  | ✅          | Full options                         |
| Scattering      | ✅          | Full options                         |
| Texture         | ❌ Disabled | Focus tools don't use texture        |
| Dual Brush      | ❌ Disabled | Focus tools don't support dual brush |
| Color Dynamics  | ❌ Disabled | Focus tools don't apply color        |
| Transfer        | ✅ Partial  | Strength Jitter only                 |
| Brush Pose      | ✅          | Full options                         |
| Noise           | ✅          | Checkbox only                        |
| Wet Edges       | ❌ Disabled | Not applicable                       |
| Build-up        | ❌ Disabled | Not applicable                       |
| Smoothing       | ✅          | Full options                         |
| Protect Texture | ❌ Disabled | No texture to protect                |

---

## Brush Settings Panel Details

### Brush Tip Shape

→ See [Brush-Tip-Shape.md](../_Common/Brush-Tip-Shape.md)

Standard brush tip settings. Default Hardness is typically 0% for soft blur effect.

### Shape Dynamics

→ See [Shape-Dynamics.md](../_Common/Shape-Dynamics.md)

Full Shape Dynamics options available:

- Size Jitter + Control + Minimum Diameter
- Tilt Scale (when Control = Pen Tilt)
- Angle Jitter + Control
- Roundness Jitter + Control + Minimum Roundness
- Flip X Jitter / Flip Y Jitter
- Brush Projection

### Scattering

→ See [Scattering.md](../_Common/Scattering.md)

Full Scattering options available.

### Transfer (Modified)

→ Base: [Transfer.md](../_Common/Transfer.md)

**Focus tools use "Strength Jitter" instead of "Opacity Jitter":**

| Setting         | Status      | Range    | Notes                                                   |
| --------------- | ----------- | -------- | ------------------------------------------------------- |
| Opacity Jitter  | ❌ Disabled | —        | Replaced by Strength Jitter                             |
| Strength Jitter | ✅          | 0-100%   | Controls variation in blur strength                     |
| └ Control       | ✅          | Standard | See [Control-Options.md](../_Common/Control-Options.md) |
| └ Minimum       | ✅          | 0-100%   | Minimum strength when jitter applied                    |
| Flow Jitter     | ❌ Disabled | —        | Not applicable                                          |
| Wetness Jitter  | ❌ Disabled | —        | Mixer Brush only                                        |
| Mix Jitter      | ❌ Disabled | —        | Mixer Brush only                                        |

### Brush Pose

→ See [Brush-Pose.md](../_Common/Brush-Pose.md)

Full Brush Pose options available.

### Smoothing

→ See [Smoothing-Options.md](../_Common/Smoothing-Options.md)

Full Smoothing options available.

---

## Quick Toggles (Toolbar)

| Toggle               | Available                  |
| -------------------- | -------------------------- |
| Pressure for Opacity | ❌ (uses Strength instead) |
| Pressure for Size    | ✅                         |
| Smoothing            | ✅                         |
| Angle                | ✅                         |
| Symmetry             | ✅                         |

---

## Sample All Layers

When enabled:

- Blur calculation considers pixels from all visible layers
- Result is painted only on the current layer
- Useful for blurring composite appearance without flattening

When disabled:

- Only samples from current layer
- Ignores pixels on other layers

---

## Differences from Other Focus Tools

| Feature           | Blur             | Sharpen            | Smudge          |
| ----------------- | ---------------- | ------------------ | --------------- |
| Effect            | Reduces contrast | Increases contrast | Pushes pixels   |
| Unique Option     | —                | Protect Detail     | Finger Painting |
| Sample All Layers | ✅               | ✅                 | ✅              |

→ See also: [Sharpen-Tool.md](../Sharpen%20Tool%20/Sharpen-Tool.md), [Smudge-Tool.md](../Smudge%20Tool%20/Smudge-Tool.md)

---

## Implementation Notes

### Strength vs Opacity

- Focus tools use "Strength" instead of "Opacity"
- Strength controls the intensity of the blur effect
- In Transfer panel, "Strength Jitter" replaces "Opacity Jitter"

### Blur Algorithm

```
For each pixel in brush stroke:
1. Sample surrounding pixels (radius based on brush size)
2. Apply Gaussian blur to sampled area
3. Blend result with Strength percentage
4. Apply Mode blending
```
