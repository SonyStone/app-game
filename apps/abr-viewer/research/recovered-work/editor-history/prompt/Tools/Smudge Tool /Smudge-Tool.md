# Smudge Tool

The Smudge Tool simulates dragging a finger through wet paint, pushing and blending pixels in the stroke direction. Part of the Focus tools group (Blur, Sharpen, Smudge).

## Toolbar Options

| Option            | Type     | Range/Values                                                | Default | Notes                                                    |
| ----------------- | -------- | ----------------------------------------------------------- | ------- | -------------------------------------------------------- |
| Mode              | Dropdown | Normal, Darken, Lighten, Hue, Saturation, Color, Luminosity | Normal  | Limited blend mode set                                   |
| Strength          | Slider   | 1-100%                                                      | 50%     | How far pixels are pushed/smeared                        |
| Angle             | Input    | 0-360°                                                      | 0°      | Brush rotation angle                                     |
| Sample All Layers | Checkbox | On/Off                                                      | Off     | Smudge based on all visible layers                       |
| Finger Painting   | Checkbox | On/Off                                                      | Off     | **Smudge-specific** - Start stroke with foreground color |

### Mode Options (Focus Tools Subset)

| Mode       | Description                                      |
| ---------- | ------------------------------------------------ |
| Normal     | Smudges all color channels equally               |
| Darken     | Only smudges pixels lighter than brush area      |
| Lighten    | Only smudges pixels darker than brush area       |
| Hue        | Smudges only hue values                          |
| Saturation | Smudges only saturation values                   |
| Color      | Smudges hue and saturation, preserves luminosity |
| Luminosity | Smudges only luminosity, preserves color         |

---

## Finger Painting

Smudge-specific option that adds foreground color to the beginning of each stroke:

| Setting | Behavior                                                  |
| ------- | --------------------------------------------------------- |
| Off     | Smudge starts by picking up existing pixels               |
| On      | Smudge starts with foreground color, then picks up pixels |

**Use cases:**

- Creating painted effects with color blending
- Adding color accents while smudging
- Simulating finger painting in wet media

```
┌─────────────────────────────────────────────────────┐
│ Finger Painting OFF:                                │
│   [Existing pixels] ──smudge──> [Blended pixels]    │
│                                                     │
│ Finger Painting ON:                                 │
│   [FG Color] + [Existing] ──smudge──> [Blended]     │
│   ↑                                                 │
│   Foreground color applied at stroke start          │
└─────────────────────────────────────────────────────┘
```

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
| Strength Jitter | ✅          | 0-100%   | Controls variation in smudge strength                   |
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

| Feature           | Blur             | Sharpen            | Smudge              |
| ----------------- | ---------------- | ------------------ | ------------------- |
| Effect            | Reduces contrast | Increases contrast | Pushes pixels       |
| Unique Option     | —                | Protect Detail     | **Finger Painting** |
| Sample All Layers | ✅               | ✅                 | ✅                  |

→ See also: [Blur-Tool.md](../Blur%20Tool/Blur-Tool.md), [Sharpen-Tool.md](../Sharpen%20Tool%20/Sharpen-Tool.md)

---

## Implementation Notes

### Strength vs Opacity

- Focus tools use "Strength" instead of "Opacity"
- Strength controls how far pixels are pushed
- Low strength = subtle smearing
- High strength = pixels carried further along stroke

### Smudge Algorithm

```
For each point in brush stroke:
1. If Finger Painting ON and stroke start: load foreground color
2. Else: sample pixels under brush
3. Push/blend sampled pixels in stroke direction
4. Amount of push determined by Strength
5. Picked-up color gradually fades along stroke length
6. Apply Mode blending
```

### Performance Considerations

- Smudge is computationally intensive
- Large brushes with high Strength may lag
- Consider brush spacing optimization for real-time performance
