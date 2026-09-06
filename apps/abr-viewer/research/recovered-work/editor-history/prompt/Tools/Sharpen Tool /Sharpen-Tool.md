# Sharpen Tool

The Sharpen Tool increases contrast between adjacent pixels, making edges appear sharper. Part of the Focus tools group (Blur, Sharpen, Smudge).

## Toolbar Options

| Option            | Type     | Range/Values                                                | Default | Notes                                          |
| ----------------- | -------- | ----------------------------------------------------------- | ------- | ---------------------------------------------- |
| Mode              | Dropdown | Normal, Darken, Lighten, Hue, Saturation, Color, Luminosity | Normal  | Limited blend mode set                         |
| Strength          | Slider   | 1-100%                                                      | 50%     | Intensity of sharpen effect                    |
| Angle             | Input    | 0-360°                                                      | 0°      | Brush rotation angle                           |
| Sample All Layers | Checkbox | On/Off                                                      | Off     | Sharpen based on all visible layers            |
| Protect Detail    | Checkbox | On/Off                                                      | Off     | **Sharpen-specific** - Reduces noise/artifacts |

### Mode Options (Focus Tools Subset)

| Mode       | Description                                       |
| ---------- | ------------------------------------------------- |
| Normal     | Sharpens all color channels equally               |
| Darken     | Only sharpens pixels lighter than brush area      |
| Lighten    | Only sharpens pixels darker than brush area       |
| Hue        | Sharpens only hue values                          |
| Saturation | Sharpens only saturation values                   |
| Color      | Sharpens hue and saturation, preserves luminosity |
| Luminosity | Sharpens only luminosity, preserves color         |

---

## Protect Detail

Sharpen-specific option that reduces noise and artifacts when sharpening:

| Setting | Behavior                                                          |
| ------- | ----------------------------------------------------------------- |
| Off     | Standard sharpening - may introduce noise in smooth areas         |
| On      | Intelligent sharpening - preserves smooth areas, focuses on edges |

**Recommended**: Enable for portraits and images with gradient areas to prevent noise amplification.

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

Standard brush tip settings.

### Shape Dynamics

→ See [Shape-Dynamics.md](../_Common/Shape-Dynamics.md)

Full Shape Dynamics options available.

### Scattering

→ See [Scattering.md](../_Common/Scattering.md)

Full Scattering options available.

### Transfer (Modified)

→ Base: [Transfer.md](../_Common/Transfer.md)

**Focus tools use "Strength Jitter" instead of "Opacity Jitter":**

| Setting         | Status      | Range    | Notes                                                   |
| --------------- | ----------- | -------- | ------------------------------------------------------- |
| Opacity Jitter  | ❌ Disabled | —        | Replaced by Strength Jitter                             |
| Strength Jitter | ✅          | 0-100%   | Controls variation in sharpen strength                  |
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

## Differences from Other Focus Tools

| Feature           | Blur             | Sharpen            | Smudge          |
| ----------------- | ---------------- | ------------------ | --------------- |
| Effect            | Reduces contrast | Increases contrast | Pushes pixels   |
| Unique Option     | —                | **Protect Detail** | Finger Painting |
| Sample All Layers | ✅               | ✅                 | ✅              |

→ See also: [Blur-Tool.md](../Blur%20Tool/Blur-Tool.md), [Smudge-Tool.md](../Smudge%20Tool%20/Smudge-Tool.md)

---

## Implementation Notes

### Strength vs Opacity

- Focus tools use "Strength" instead of "Opacity"
- Strength controls the intensity of the sharpen effect
- In Transfer panel, "Strength Jitter" replaces "Opacity Jitter"

### Sharpen Algorithm

```
For each pixel in brush stroke:
1. Detect edges using contrast detection
2. Increase contrast at edge boundaries
3. If Protect Detail: preserve smooth/low-contrast areas
4. Apply result with Strength percentage
5. Apply Mode blending
```

### Over-sharpening Warning

- High Strength values can create halos and artifacts
- Consider using Protect Detail for cleaner results
- Multiple light passes often better than single heavy pass
