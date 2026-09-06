# Eraser Tool

The Eraser Tool removes pixels from a layer, either making them transparent or replacing them with the background color (on locked/Background layers). It supports three erasing modes with different behaviors.

## Toolbar Options

| Option           | Type     | Range/Values         | Default | Notes                                                |
| ---------------- | -------- | -------------------- | ------- | ---------------------------------------------------- |
| Mode             | Dropdown | Brush, Pencil, Block | Brush   | Determines eraser behavior and available settings    |
| Opacity          | Slider   | 1-100%               | 100%    | Controls erasing strength                            |
| Flow             | Slider   | 1-100%               | 100%    | **Only in Brush mode** - Rate of erasure application |
| Smoothing        | Slider   | 0-100%               | ?       | **Only in Brush/Pencil modes** - Stroke smoothing    |
| Angle            | Input    | 0-360°               | 0°      | Brush rotation angle                                 |
| Erase to History | Checkbox | On/Off               | Off     | Restores pixels to selected history state            |

### Eraser Mode Behaviors

#### Brush Mode

- Uses brush tip with anti-aliasing
- Full brush settings panel available
- Has Flow control for gradual erasure
- Supports Smoothing
- Produces soft-edged erasure

#### Pencil Mode

- Uses brush tip without anti-aliasing
- No Flow control (like Pencil Tool)
- Supports Smoothing
- Produces hard-edged erasure
- Auto Erase not available (only paints, doesn't exist for eraser)

#### Block Mode

- Uses fixed square cursor
- No brush settings panel
- No Flow, no Smoothing
- Only Opacity control works
- Fixed size based on zoom level
- Fastest for large area clearing

---

## Brush Settings Panel Availability

| Panel           | Brush Mode  | Pencil Mode | Block Mode |
| --------------- | ----------- | ----------- | ---------- |
| Brush Tip Shape | ✅          | ✅          | ❌ Grayed  |
| Shape Dynamics  | ✅          | ✅          | ❌ Grayed  |
| Scattering      | ✅          | ✅          | ❌ Grayed  |
| Texture         | ✅          | ✅          | ❌ Grayed  |
| Dual Brush      | ✅          | ✅          | ❌ Grayed  |
| Color Dynamics  | ❌ Disabled | ❌ Disabled | ❌ Grayed  |
| Transfer        | ✅ Partial  | ✅ Partial  | ❌ Grayed  |
| Brush Pose      | ✅          | ✅          | ❌ Grayed  |
| Noise           | ✅          | ✅          | ❌ Grayed  |
| Wet Edges       | ❌ Disabled | ❌ Disabled | ❌ Grayed  |
| Build-up        | ✅          | ❌ Disabled | ❌ Grayed  |
| Smoothing       | ✅          | ✅          | ❌ Grayed  |
| Protect Texture | ✅          | ✅          | ❌ Grayed  |

> **Block Mode**: The entire Brush Settings panel remains visible but is completely grayed out and non-interactive. The brush preview area is empty. All controls (Size, Flip, Angle, Roundness, Hardness, Spacing) are disabled.

---

## Brush Settings Panel Details

### Brush Tip Shape

→ See [Brush-Tip-Shape.md](../_Common/Brush-Tip-Shape.md)

Standard brush tip settings. All options available.

### Shape Dynamics

→ See [Shape-Dynamics.md](../_Common/Shape-Dynamics.md)

Full Shape Dynamics with all controls:

- Size Jitter + Control + Minimum Diameter
- Tilt Scale (when Control = Pen Tilt)
- Angle Jitter + Control
- Roundness Jitter + Control + Minimum Roundness
- Flip X Jitter / Flip Y Jitter
- Brush Projection

### Scattering

→ See [Scattering.md](../_Common/Scattering.md)

Full Scattering options available.

### Texture

→ See [Texture.md](../_Common/Texture.md)

Full Texture options:

- Pattern selector + Invert
- Scale, Brightness, Contrast
- Texture Each Tip checkbox
- Mode dropdown (when Texture Each Tip enabled)
- Depth + Minimum Depth + Depth Jitter + Control

### Dual Brush

→ See [Dual-Brush.md](../_Common/Dual-Brush.md)

Full Dual Brush options:

- Mode: Color Burn (and other blend modes)
- Flip checkbox
- Brush tip selector
- Size, Spacing, Scatter (+ Both Axes), Count

### Color Dynamics

❌ **Disabled** - Eraser removes pixels, doesn't apply color.

The entire Color Dynamics panel is grayed out and non-functional for the Eraser Tool.

### Transfer

→ See [Transfer.md](../_Common/Transfer.md)

**Partial availability:**

| Setting        | Brush Mode  | Pencil Mode |
| -------------- | ----------- | ----------- |
| Opacity Jitter | ✅          | ✅          |
| Flow Jitter    | ✅          | ❌ Disabled |
| Wetness Jitter | ❌ Disabled | ❌ Disabled |
| Mix Jitter     | ❌ Disabled | ❌ Disabled |

- Wetness/Mix Jitter are Mixer Brush-specific, always disabled
- Flow Jitter disabled in Pencil mode (no Flow control)

### Brush Pose

→ See [Brush-Pose.md](../_Common/Brush-Pose.md)

Full Brush Pose options:

- Tilt X / Tilt Y with Override checkboxes
- Rotation with Override checkbox
- Pressure with Override checkbox

### Noise

Checkbox only - adds grain/noise to the eraser edge.

### Wet Edges

❌ **Disabled** - Wet Edges creates paint accumulation effect, not applicable to erasing.

### Build-up

- ✅ **Brush Mode**: Available - allows opacity to accumulate with overlapping strokes
- ❌ **Pencil Mode**: Disabled - Pencil mode doesn't support build-up (like Pencil Tool)

### Smoothing

→ See [Smoothing-Options.md](../_Common/Smoothing-Options.md)

Available in Brush and Pencil modes. Controls stroke smoothing.

### Protect Texture

Checkbox only - maintains consistent texture across different brushes/tools.

---

## Quick Toggles (Toolbar)

| Toggle               | Keyboard | Available          |
| -------------------- | -------- | ------------------ |
| Airbrush/Build-up    | —        | ✅ Brush mode only |
| Pressure for Opacity | —        | ✅                 |
| Pressure for Size    | —        | ✅                 |
| Smoothing            | —        | ✅                 |
| Angle                | —        | ✅                 |
| Symmetry             | —        | ✅                 |

---

## Erase to History Feature

The "Erase to History" checkbox enables a special mode:

```
┌─────────────────────────────────────────────────────┐
│ Normal Erase Mode:                                  │
│   Pixels → Transparent (or Background Color)        │
│                                                     │
│ Erase to History Mode:                              │
│   Pixels → Restored to selected History State       │
│                                                     │
│ This is similar to History Brush but in reverse:   │
│   - History Brush: paints history onto current     │
│   - Erase to History: reveals history by erasing   │
└─────────────────────────────────────────────────────┘
```

### Behavior

- When enabled, erasing restores pixels to the state selected in the History panel
- The source state is indicated by the history source icon (same as History Brush)
- Useful for selective restoration without switching tools

### History Panel Integration

→ See [History-Brush-Tool.md](../History%20Brush%20Tool%20/History-Brush-Tool.md#history-panel-integration)

Uses the same history source selection as the History Brush Tool.

---

## Eraser on Different Layer Types

| Layer Type                     | Erase Result                                            |
| ------------------------------ | ------------------------------------------------------- |
| Normal layer                   | Transparent pixels                                      |
| Background layer               | Filled with Background Color                            |
| Layer with transparency locked | Filled with Background Color                            |
| Layer mask                     | Black (hides) or White (reveals) depending on mask mode |
| Quick Mask                     | Removes from selection                                  |

---

## Mode Comparison

| Feature              | Brush         | Pencil     | Block          |
| -------------------- | ------------- | ---------- | -------------- |
| Anti-aliased edges   | ✅            | ❌         | ❌             |
| Brush tip selection  | ✅            | ✅         | ❌             |
| Flow control         | ✅            | ❌         | ❌             |
| Smoothing            | ✅            | ✅         | ❌             |
| Brush Settings panel | ✅ Full       | ✅ Partial | ❌ None        |
| Pressure sensitivity | ✅            | ✅         | ❌             |
| Variable size        | ✅            | ✅         | Zoom-based     |
| Best for             | Detailed work | Hard edges | Quick clearing |

---

## Differences from Brush Tool

| Aspect                | Brush Tool    | Eraser Tool                     |
| --------------------- | ------------- | ------------------------------- |
| Purpose               | Applies color | Removes pixels                  |
| Color Dynamics        | ✅ Full       | ❌ Disabled                     |
| Wet Edges             | ✅ Available  | ❌ Disabled                     |
| Blend Mode in toolbar | Full list     | N/A (Mode = Brush/Pencil/Block) |
| Erase to History      | ❌            | ✅                              |
| Block mode            | ❌            | ✅                              |

---

## Implementation Notes

### Mode Switching

```
When Mode changes:
├── "Brush" → Show full toolbar, enable Flow, enable Build-up
├── "Pencil" → Hide Flow, disable Build-up, disable Flow Jitter
└── "Block" → Hide Flow/Smoothing, disable all Brush Settings panels
```

### Erase to History State

- Store boolean `eraseToHistory` flag
- When enabled, read history source from same location as History Brush
- Apply history state pixels instead of transparency

### Block Mode Cursor

- Cursor is a fixed square
- Size varies with zoom level (appears same screen size)
- No brush preview needed
