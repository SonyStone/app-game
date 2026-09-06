# Burn Tool

The Burn Tool darkens areas of an image, simulating the traditional darkroom technique of giving additional exposure to specific areas. Part of the Toning tools group (Dodge, Burn, Sponge).

## Toolbar Options

| Option        | Type     | Range/Values                  | Default  | Notes                               |
| ------------- | -------- | ----------------------------- | -------- | ----------------------------------- |
| Range         | Dropdown | Shadows, Midtones, Highlights | Midtones | Which tonal range to affect         |
| Exposure      | Slider   | 1-100%                        | 50%      | Intensity of darkening effect       |
| Angle         | Input    | 0-360°                        | 0°       | Brush rotation angle                |
| Protect Tones | Checkbox | On/Off                        | On       | Minimizes clipping and color shifts |

### Range Options

| Range      | Affects                            | Best For                 |
| ---------- | ---------------------------------- | ------------------------ |
| Shadows    | Dark areas (0-33% luminosity)      | Deepening blacks         |
| Midtones   | Mid-gray areas (33-66% luminosity) | General darkening        |
| Highlights | Light areas (66-100% luminosity)   | Toning down bright areas |

### Protect Tones

| Setting | Behavior                                                       |
| ------- | -------------------------------------------------------------- |
| Off     | Raw darkening - may cause color shifts and crushing            |
| On      | Smart darkening - preserves color saturation and shadow detail |

**Recommended**: Keep enabled to maintain natural-looking results.

---

## Brush Settings Panel Availability

| Panel           | Status      | Notes                          |
| --------------- | ----------- | ------------------------------ |
| Brush Tip Shape | ✅          | Full options                   |
| Shape Dynamics  | ✅          | Full options                   |
| Scattering      | ✅          | Full options                   |
| Texture         | ✅          | Full options                   |
| Dual Brush      | ✅          | Full options                   |
| Color Dynamics  | ❌ Disabled | Toning tools don't apply color |
| Transfer        | ✅ Partial  | Exposure Jitter only           |
| Brush Pose      | ✅          | Full options                   |
| Noise           | ✅          | Checkbox only                  |
| Wet Edges       | ✅          | Checkbox only                  |
| Build-up        | ✅          | Checkbox only                  |
| Smoothing       | ✅          | Full options                   |
| Protect Texture | ✅          | Checkbox only                  |

---

## Brush Settings Panel Details

### Brush Tip Shape

→ See [Brush-Tip-Shape.md](../_Common/Brush-Tip-Shape.md)

Standard brush tip settings. Default Hardness typically 0% for soft burning.

### Shape Dynamics

→ See [Shape-Dynamics.md](../_Common/Shape-Dynamics.md)

Full Shape Dynamics options available.

### Scattering

→ See [Scattering.md](../_Common/Scattering.md)

Full Scattering options available.

### Texture

→ See [Texture.md](../_Common/Texture.md)

Full Texture options available - applies texture pattern to burn effect.

### Dual Brush

→ See [Dual-Brush.md](../_Common/Dual-Brush.md)

Full Dual Brush options available.

### Transfer (Modified)

→ Base: [Transfer.md](../_Common/Transfer.md)

**Toning tools use "Exposure Jitter" instead of "Opacity Jitter":**

| Setting         | Status      | Range    | Notes                                                   |
| --------------- | ----------- | -------- | ------------------------------------------------------- |
| Opacity Jitter  | ❌ Disabled | —        | Replaced by Exposure Jitter                             |
| Exposure Jitter | ✅          | 0-100%   | Controls variation in burn exposure                     |
| └ Control       | ✅          | Standard | See [Control-Options.md](../_Common/Control-Options.md) |
| └ Minimum       | ✅          | 0-100%   | Minimum exposure when jitter applied                    |
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
| Pressure for Opacity | ❌ (uses Exposure instead) |
| Pressure for Size    | ✅                         |
| Smoothing            | ✅                         |
| Angle                | ✅                         |
| Symmetry             | ✅                         |

---

## Differences from Other Toning Tools

| Feature           | Dodge    | Burn         | Sponge                |
| ----------------- | -------- | ------------ | --------------------- |
| Effect            | Lightens | **Darkens**  | Saturates/Desaturates |
| Intensity Control | Exposure | **Exposure** | Flow                  |
| Range Option      | ✅       | **✅**       | ❌                    |
| Mode Option       | ❌       | ❌           | Saturate/Desaturate   |
| Protect Tones     | ✅       | **✅**       | ❌                    |
| Vibrance          | ❌       | ❌           | ✅                    |

→ See also: [Dodge-Tool.md](../Dodge%20Tool%20/Dodge-Tool.md), [Sponge-Tool.md](../Sponge%20Tool%20/Sponge-Tool.md)

---

## Implementation Notes

### Exposure vs Opacity

- Toning tools use "Exposure" instead of "Opacity"
- Exposure controls the intensity of the darkening effect
- In Transfer panel, "Exposure Jitter" replaces "Opacity Jitter"

### Burn Algorithm

```
For each pixel in brush stroke:
1. Check if pixel luminosity falls within selected Range
2. If yes: darken pixel by Exposure percentage
3. If Protect Tones: preserve saturation, prevent crushing
4. Blend result with original based on brush opacity/flow
```

### Range Boundaries

- Shadows: ~0-33% luminosity
- Midtones: ~33-66% luminosity
- Highlights: ~66-100% luminosity
- Boundaries are soft (feathered) for natural transitions
