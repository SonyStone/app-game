# Sponge Tool

The Sponge Tool adjusts color saturation of an area, either increasing (saturating) or decreasing (desaturating) color intensity. Part of the Toning tools group (Dodge, Burn, Sponge).

## Toolbar Options

| Option   | Type     | Range/Values         | Default    | Notes                          |
| -------- | -------- | -------------------- | ---------- | ------------------------------ |
| Mode     | Dropdown | Desaturate, Saturate | Desaturate | Direction of saturation change |
| Flow     | Slider   | 1-100%               | 50%        | Rate of saturation change      |
| Angle    | Input    | 0-360°               | 0°         | Brush rotation angle           |
| Vibrance | Checkbox | On/Off               | On         | Smart saturation adjustment    |

### Mode Options

| Mode       | Effect                                         |
| ---------- | ---------------------------------------------- |
| Desaturate | Reduces color saturation (toward grayscale)    |
| Saturate   | Increases color saturation (more vivid colors) |

### Vibrance

| Setting | Behavior                                                            |
| ------- | ------------------------------------------------------------------- |
| Off     | Uniform saturation change to all colors                             |
| On      | Smart saturation - protects already-saturated colors and skin tones |

**Vibrance ON** (recommended):

- Boosts muted colors more than already-vivid colors
- Protects skin tones from over-saturation
- Prevents color clipping
- More natural-looking results

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

Standard brush tip settings.

### Shape Dynamics

→ See [Shape-Dynamics.md](../_Common/Shape-Dynamics.md)

Full Shape Dynamics options available.

### Scattering

→ See [Scattering.md](../_Common/Scattering.md)

Full Scattering options available.

### Texture

→ See [Texture.md](../_Common/Texture.md)

Full Texture options available - applies texture pattern to sponge effect.

### Dual Brush

→ See [Dual-Brush.md](../_Common/Dual-Brush.md)

Full Dual Brush options available.

### Transfer (Modified)

→ Base: [Transfer.md](../_Common/Transfer.md)

**Toning tools use "Exposure Jitter" instead of "Opacity Jitter":**

| Setting         | Status      | Range    | Notes                                                   |
| --------------- | ----------- | -------- | ------------------------------------------------------- |
| Opacity Jitter  | ❌ Disabled | —        | Replaced by Exposure Jitter                             |
| Exposure Jitter | ✅          | 0-100%   | Controls variation in sponge intensity                  |
| └ Control       | ✅          | Standard | See [Control-Options.md](../_Common/Control-Options.md) |
| └ Minimum       | ✅          | 0-100%   | Minimum intensity when jitter applied                   |
| Flow Jitter     | ❌ Disabled | —        | Not applicable                                          |
| Wetness Jitter  | ❌ Disabled | —        | Mixer Brush only                                        |
| Mix Jitter      | ❌ Disabled | —        | Mixer Brush only                                        |

> **Note**: Despite using "Flow" in the toolbar, the Transfer panel still uses "Exposure Jitter" for consistency with other toning tools.

### Brush Pose

→ See [Brush-Pose.md](../_Common/Brush-Pose.md)

Full Brush Pose options available.

### Smoothing

→ See [Smoothing-Options.md](../_Common/Smoothing-Options.md)

Full Smoothing options available.

---

## Quick Toggles (Toolbar)

| Toggle               | Available              |
| -------------------- | ---------------------- |
| Pressure for Opacity | ❌ (uses Flow instead) |
| Pressure for Size    | ✅                     |
| Smoothing            | ✅                     |
| Angle                | ✅                     |
| Symmetry             | ✅                     |

---

## Differences from Other Toning Tools

| Feature           | Dodge    | Burn     | Sponge                    |
| ----------------- | -------- | -------- | ------------------------- |
| Effect            | Lightens | Darkens  | **Saturates/Desaturates** |
| Intensity Control | Exposure | Exposure | **Flow**                  |
| Range Option      | ✅       | ✅       | **❌**                    |
| Mode Option       | ❌       | ❌       | **Saturate/Desaturate**   |
| Protect Tones     | ✅       | ✅       | **❌**                    |
| Vibrance          | ❌       | ❌       | **✅**                    |

→ See also: [Dodge-Tool.md](../Dodge%20Tool%20/Dodge-Tool.md), [Burn-Tool.md](../Burn%20Tool%20/Burn-Tool.md)

---

## Implementation Notes

### Flow vs Exposure

- Sponge uses "Flow" in toolbar (not "Exposure" like Dodge/Burn)
- Controls the rate/intensity of saturation change
- Transfer panel still uses "Exposure Jitter" naming

### Sponge Algorithm

```
For each pixel in brush stroke:
1. Get current pixel saturation (HSL/HSB color space)
2. If Mode = Desaturate: reduce saturation by Flow percentage
3. If Mode = Saturate: increase saturation by Flow percentage
4. If Vibrance ON:
   - Weight change inversely to current saturation
   - Protect skin tone hue range (orange-red)
5. Blend result with original
```

### Color Space Consideration

- Saturation adjustments work in HSL or HSB color space
- Hue and Lightness remain unchanged
- Only the Saturation channel is modified
