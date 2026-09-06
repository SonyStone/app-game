# Smoothing Options

Smoothing reduces jitter and hand tremor in brush strokes, creating cleaner lines.

## Toolbar Setting

### Smoothing

- **Type:** Numeric input with dropdown/slider
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Higher values = smoother strokes with more lag

## Smoothing Options Panel

Accessed via the gear icon (⚙️) next to the Smoothing value in the toolbar.

### Pulled String Mode

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** Only draws when cursor exceeds a certain distance from last point
- **Visual:** Appears like pulling a string - stroke follows at a distance
- **Use Case:** Very precise lines, technical drawing

### Stroke Catch-up

- **Type:** Checkbox
- **Default:** Checked (in your screenshot)
- **Effect:** Stroke gradually catches up to cursor position when cursor stops
- **Behavior:** Creates trailing effect that completes when paused

### Catch-up on Stroke End

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect:** When releasing pen/mouse, stroke quickly completes to final cursor position
- **Use Case:** Ensures stroke ends exactly where intended, not behind

### Adjust for Zoom

- **Type:** Checkbox
- **Default:** Checked (in your screenshot)
- **Effect:** Adjusts smoothing amount based on canvas zoom level
- **Behavior:** More smoothing when zoomed out, less when zoomed in
- **Use Case:** Consistent feel regardless of zoom level

## Smoothing Algorithm Concepts

### Basic Smoothing (Low %)

- Light averaging of recent cursor positions
- Minimal lag
- Good for natural painting

### Heavy Smoothing (High %)

- Strong averaging/interpolation
- Noticeable lag between cursor and stroke
- Good for clean lineart

### Pulled String Mode

```
Cursor position:  ○ (moves freely)
                   \
                    \  (string length = smoothing amount)
                     \
Stroke endpoint:      ● (only moves when string is taut)
```

## Implementation Notes

### Smoothing Calculation

Common approach - weighted moving average:

```typescript
// Simple exponential smoothing
const smoothingFactor = smoothingPercent / 100;
smoothedX = previousX + (currentX - previousX) * (1 - smoothingFactor);
smoothedY = previousY + (currentY - previousY) * (1 - smoothingFactor);
```

### Pulled String Implementation

```typescript
const stringLength = maxStringLength * (smoothingPercent / 100);
const distance = Math.hypot(cursorX - strokeX, cursorY - strokeY);

if (distance > stringLength) {
  // Move stroke point toward cursor, maintaining string length
  const angle = Math.atan2(cursorY - strokeY, cursorX - strokeX);
  strokeX = cursorX - Math.cos(angle) * stringLength;
  strokeY = cursorY - Math.sin(angle) * stringLength;
}
```

### Stroke Catch-up

When cursor stops moving:

```typescript
// Gradually move stroke toward cursor
if (!isMoving && distance > threshold) {
  strokeX += (cursorX - strokeX) * catchupSpeed;
  strokeY += (cursorY - strokeY) * catchupSpeed;
}
```

### Zoom Adjustment

```typescript
const effectiveSmoothing = adjustForZoom ? smoothingPercent / zoomLevel : smoothingPercent;
```

## Brush Settings Panel Checkbox

In addition to toolbar smoothing, there's a **Smoothing** checkbox in the Brush Settings panel left sidebar. This checkbox:

- Enables/disables the smoothing feature entirely
- When unchecked, ignores toolbar smoothing value
- Has a lock icon to preserve setting when switching brushes

## Tool Availability

Smoothing is available for:

- ✅ Brush Tool
- ✅ Pencil Tool
- ✅ Mixer Brush Tool
- ✅ Clone Stamp Tool
- ❌ Most other tools (Blur, Sharpen, Smudge, etc.)
