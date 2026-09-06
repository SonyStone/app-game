# Brush Tip Shape

The Brush Tip Shape panel defines the fundamental shape and behavior of the brush tip.

## Brush Tip Selector

A grid displaying available brush tips with:

- **Thumbnail**: Preview of brush tip shape
- **Size**: Original/default size in pixels shown below each tip

### Brush Tip Types

- **Sampled Brushes**: Have a bitmap image as the tip
- **Computed Brushes**: Generated mathematically (hard round, soft round)

## Settings

### Size

- **Type:** Slider with numeric input
- **Range:** 1 - 5000 px
- **Default:** Varies per brush
- **Reset Button:** Resets to brush's original saved size
- **Shortcut:** `[` decreases, `]` increases size
- **Slider Behavior:** NON-LINEAR (see below)

#### Non-Linear Size Slider Mapping

The slider position maps to pixel values non-linearly for better control at smaller sizes:

| Slider Position | Pixel Range   |
| --------------- | ------------- |
| 0% - 50%        | 1 - 100 px    |
| 50% - 75%       | 100 - 200 px  |
| 75% - 87.5%     | 200 - 500 px  |
| 87.5% - 100%    | 500 - 5000 px |

### Flip X

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** Horizontally mirrors the brush tip

### Flip Y

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** Vertically mirrors the brush tip

### Angle

- **Type:** Numeric input with scrubby slider
- **Range:** -180° to 180°
- **Default:** 0°
- **UI:** Can also be adjusted via the circular angle/roundness control

### Roundness

- **Type:** Numeric input with scrubby slider
- **Range:** 1% - 100%
- **Default:** 100%
- **Effect:** Compresses brush tip vertically (elliptical distortion)
- **UI:** Can also be adjusted via the circular angle/roundness control

### Angle/Roundness Interactive Control

A circular UI element showing:

- **Rotation handle**: Drag to adjust angle
- **Edge handles**: Drag to adjust roundness
- Visual preview of current angle and roundness

### Hardness

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 100%
- **Availability:** Only enabled for **computed brushes** (hard round, soft round)
- **Disabled:** For sampled brushes (grayed out)
- **Effect:** Controls edge softness (0% = soft edges, 100% = hard edges)

### Spacing

- **Type:** Checkbox + Slider with numeric input
- **Checkbox Default:** Checked
- **Range:** 1% - 1000%
- **Default:** 25% (varies per brush)
- **Effect:** Distance between brush marks as percentage of brush diameter
- **When Unchecked:** Spacing is determined by cursor speed (continuous stroke)
- **Slider Behavior:** NON-LINEAR (see below)

#### Non-Linear Spacing Slider Mapping

| Slider Position | Spacing Range |
| --------------- | ------------- |
| 0% - 50%        | 1% - 100%     |
| 50% - 75%       | 100% - 200%   |
| 75% - 87.5%     | 200% - 500%   |
| 87.5% - 100%    | 500% - 1000%  |

## Brush Preview

At the bottom of the panel, a live preview shows:

- Current brush stroke appearance
- Updates in real-time as settings change
- Shows effect of all brush settings combined

## Implementation Notes

### Computed vs Sampled Brush Detection

```typescript
type BrushType = 'sampled' | 'computed';

// Hardness slider visibility
const showHardness = brush.type === 'computed';
```

### Angle/Roundness Control

The circular control is a common Photoshop UI pattern:

- Ellipse shape reflects current roundness
- Rotation reflects current angle
- Interactive dragging should update both angle and roundness inputs
- Arrow or line indicates current angle direction

### Size Reset

The reset button (circular arrow icon) next to Size should restore the brush's originally saved diameter, not a global default.

### Spacing Behavior

When spacing checkbox is unchecked:

- Brush stamps are placed based on cursor movement speed
- Faster movement = more spacing
- This creates a more natural, variable stroke
