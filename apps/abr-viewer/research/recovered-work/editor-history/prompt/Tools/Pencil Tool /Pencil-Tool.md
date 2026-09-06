# Pencil Tool

A hard-edged painting tool that creates aliased (non-anti-aliased) strokes, simulating traditional pencil drawing.

## Toolbar Options

![Pencil Tool Toolbar](./Pencil%20Tool%20-%20Toolbar.png)

| Setting                  | Type           | Range                                    | Default | Description                                                   |
| ------------------------ | -------------- | ---------------------------------------- | ------- | ------------------------------------------------------------- |
| **Mode**                 | Dropdown       | [Blend Modes](../_Common/Blend-Modes.md) | Normal  | Painting blend mode                                           |
| **Opacity**              | Slider + Input | 0% - 100%                                | 100%    | Overall stroke opacity                                        |
| **Smoothing**            | Input          | 0% - 100%                                | 0%      | Stroke smoothing amount                                       |
| **Smoothing Options**    | Gear icon (⚙️) | -                                        | -       | [Smoothing Options](../_Common/Smoothing-Options.md)          |
| **Pressure for Opacity** | Toggle button  | On/Off                                   | Off     | Use pen pressure for opacity                                  |
| **Pressure for Size**    | Toggle button  | On/Off                                   | Off     | Use pen pressure for size                                     |
| **Angle**                | Display        | 0° - 360°                                | 0°      | Shows current brush angle                                     |
| **Auto Erase**           | Checkbox       | On/Off                                   | Off     | Erase to background color when painting over foreground color |
| **Symmetry**             | Butterfly icon | -                                        | Off     | [Symmetry Options](../_Common/Symmetry-Options.md)            |

### Differences from Brush Tool Toolbar

| Feature    | Brush Tool | Pencil Tool |
| ---------- | ---------- | ----------- |
| Flow       | ✅ Yes     | ❌ No       |
| Auto Erase | ❌ No      | ✅ Yes      |

### Auto Erase Feature

When **Auto Erase** is enabled:

- Painting over areas that match the **foreground color** → paints with **background color**
- Painting over any other color → paints with **foreground color**
- Useful for quick touch-ups and corrections without switching colors

## Brush Settings Panel

### Available Panels

| Panel           | Checkbox | Lock | Description                                       |
| --------------- | -------- | ---- | ------------------------------------------------- |
| Brush Tip Shape | -        | -    | [Brush Tip Shape](../_Common/Brush-Tip-Shape.md)  |
| Shape Dynamics  | ✅       | 🔒   | [Shape Dynamics](../_Common/Shape-Dynamics.md)    |
| Scattering      | ✅       | 🔒   | [Scattering](../_Common/Scattering.md)            |
| Texture         | ✅       | 🔒   | [Texture](../_Common/Texture.md)                  |
| Dual Brush      | ✅       | 🔒   | [Dual Brush](../_Common/Dual-Brush.md)            |
| Color Dynamics  | ✅       | 🔒   | [Color Dynamics](../_Common/Color-Dynamics.md)    |
| Transfer        | ✅       | 🔒   | [Transfer](../_Common/Transfer.md) (Opacity only) |
| Brush Pose      | ✅       | 🔒   | [Brush Pose](../_Common/Brush-Pose.md)            |

### Quick Toggles

| Setting         | Available   | Description                      |
| --------------- | ----------- | -------------------------------- |
| Noise           | ✅          | Adds grain to brush edges        |
| Wet Edges       | ❌ DISABLED | Not available for Pencil         |
| Build-up        | ❌ DISABLED | Not available for Pencil         |
| Smoothing       | ✅          | Enable stroke smoothing          |
| Protect Texture | ✅          | Use same texture for all brushes |

## Panel-Specific Differences

### Transfer Panel

The Pencil Tool has limited Transfer options compared to Brush Tool:

| Setting        | Pencil Tool | Brush Tool      |
| -------------- | ----------- | --------------- |
| Opacity Jitter | ✅ Enabled  | ✅ Enabled      |
| Flow Jitter    | ❌ DISABLED | ✅ Enabled      |
| Wetness Jitter | ❌ DISABLED | ❌ (Mixer only) |
| Mix Jitter     | ❌ DISABLED | ❌ (Mixer only) |

**Reason:** Pencil Tool has no Flow setting, so Flow Jitter is not applicable.

### Brush Tip Shape

All settings are the same as Brush Tool:

- Size (1-5000px, non-linear slider)
- Flip X / Flip Y
- Angle / Roundness
- Hardness (for computed brushes)
- Spacing (1-1000%, non-linear slider)

## Pencil vs Brush: Visual Difference

```
Brush Tool (anti-aliased):
████████████████
██████████████░░
████████████░░░░
██████████░░░░░░  (smooth edges)

Pencil Tool (aliased):
████████████████
████████████████
████████████████
████████████████  (hard pixel edges)
```

The Pencil Tool creates hard, pixelated edges - useful for:

- Pixel art
- Technical drawings
- Creating hard-edged masks
- Retro/8-bit style graphics

## Keyboard Shortcuts

| Shortcut           | Action                           |
| ------------------ | -------------------------------- |
| `B` then `Shift+B` | Cycle to Pencil Tool             |
| `N`                | Select Pencil Tool (if assigned) |
| `[`                | Decrease brush size              |
| `]`                | Increase brush size              |
| `0-9`              | Set opacity                      |

## Include Color

Like Brush Tool, Pencil Tool can save color with brush presets:

- **Include Color** option available when saving preset
- Stores foreground color with the brush

## Implementation Notes

### Hard Edges

The key difference in rendering:

- Brush Tool uses anti-aliasing for smooth edges
- Pencil Tool skips anti-aliasing, creating aliased/pixelated edges

```typescript
// Conceptual difference
function renderBrushStamp(x, y, brush) {
  if (tool === 'pencil') {
    // No anti-aliasing - binary coverage
    drawHardEdge(x, y, brush);
  } else {
    // Anti-aliased - smooth alpha coverage
    drawSoftEdge(x, y, brush);
  }
}
```

### Auto Erase Implementation

```typescript
function getDrawColor(pixelUnderCursor: Color): Color {
  if (!autoErase) return foregroundColor;

  if (colorEquals(pixelUnderCursor, foregroundColor)) {
    return backgroundColor;
  }
  return foregroundColor;
}
```

### Flow Not Applicable

Since Pencil creates hard-edged strokes:

- No paint "build-up" concept
- Each stamp is either fully on or fully off
- Flow would have no visual effect
