# Symmetry Options

Symmetry allows painting with automatic mirrored/repeated strokes based on various symmetry patterns.

## Accessing Symmetry

Accessed via the butterfly icon (🦋) in the toolbar.

## Symmetry Types

### Symmetry Off

- Disables symmetry painting
- Normal single-stroke painting

### Last Used Symmetry

- Quickly re-enables the previously used symmetry setting

---

### Basic Symmetry Modes

#### Vertical

- **Icon:** Single vertical line
- **Effect:** Mirrors stroke across vertical axis (left ↔ right)
- **Axes:** 1

#### Horizontal

- **Icon:** Single horizontal line
- **Effect:** Mirrors stroke across horizontal axis (top ↔ bottom)
- **Axes:** 1

#### Dual Axis

- **Icon:** Cross (+)
- **Effect:** Mirrors across both vertical and horizontal axes
- **Axes:** 2
- **Result:** 4 simultaneous strokes

#### Diagonal

- **Icon:** Diagonal line
- **Effect:** Mirrors across 45° diagonal axis
- **Axes:** 1

#### Wavy

- **Icon:** Wavy line
- **Effect:** Creates wavy/sine wave symmetry
- **Customizable:** Wave amplitude and frequency

---

### Radial Symmetry Modes

#### Circle

- **Icon:** Circle
- **Effect:** Radial symmetry around a center point
- **Customizable:** Number of segments (2-12)

#### Spiral

- **Icon:** Spiral
- **Effect:** Spiral pattern radiating from center
- **Customizable:** Spiral parameters

#### Parallel Lines

- **Icon:** Parallel lines
- **Effect:** Repeats stroke across parallel axes
- **Customizable:** Number of lines, spacing

#### Radial...

- **Icon:** Radial lines
- **Opens Dialog:** Configure number of radial segments
- **Range:** 2-12 segments
- **Effect:** Rotational symmetry around center

#### Mandala...

- **Icon:** Mandala pattern
- **Opens Dialog:** Configure mandala settings
- **Options:** Number of segments, mirror within segments
- **Effect:** Complex mandala pattern with mirroring

---

### Symmetry Path Options

#### Selected Path

- **Effect:** Uses currently selected vector path as symmetry axis
- **Use Case:** Custom symmetry shapes

#### Transform Symmetry

- **Effect:** Opens transform controls to move/rotate/scale symmetry axes
- **Allows:** Repositioning the center point and axes

#### Hide Symmetry

- **Effect:** Hides the symmetry guides while keeping symmetry active
- **Use Case:** Cleaner view while painting

## Symmetry Guide Appearance

When symmetry is active:

- Colored lines show the symmetry axes
- Center point shows rotation origin for radial modes
- Guides can be moved/rotated with Transform Symmetry

## Implementation Notes

### Basic Mirror Calculation

```typescript
// Vertical symmetry
mirrorX = centerX + (centerX - strokeX);
mirrorY = strokeY;

// Horizontal symmetry
mirrorX = strokeX;
mirrorY = centerY + (centerY - strokeY);

// Dual axis (4 strokes)
stroke1 = { x: strokeX, y: strokeY };
stroke2 = { x: mirrorX_vertical, y: strokeY };
stroke3 = { x: strokeX, y: mirrorY_horizontal };
stroke4 = { x: mirrorX_vertical, y: mirrorY_horizontal };
```

### Radial Symmetry Calculation

```typescript
function getRadialPoints(x, y, centerX, centerY, segments) {
  const points = [];
  const angleStep = (2 * Math.PI) / segments;
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.hypot(dx, dy);
  const baseAngle = Math.atan2(dy, dx);

  for (let i = 0; i < segments; i++) {
    const angle = baseAngle + angleStep * i;
    points.push({
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance
    });
  }
  return points;
}
```

### Mandala Symmetry

Mandala adds reflection within each radial segment:

1. Calculate radial points
2. For each segment, also add mirrored point across segment's center line

### Transform Symmetry

Allow user to:

- **Move:** Drag center point to reposition
- **Rotate:** Rotate the entire symmetry axis
- **Scale:** (for some modes) Adjust symmetry pattern size

### Symmetry with Other Settings

Symmetry applies AFTER all other brush dynamics:

1. Calculate brush stroke with all dynamics
2. Duplicate stroke across symmetry axes
3. Each symmetry copy uses same random seeds for jitter values

## Tool Availability

Symmetry is available for:

- ✅ Brush Tool
- ✅ Pencil Tool
- ✅ Mixer Brush Tool
- ❌ Clone Stamp Tool
- ❌ Most other tools

## UI Considerations

### Symmetry Indicator

When symmetry is active, the toolbar shows:

- Butterfly icon highlighted/active
- Current symmetry type indicator

### Quick Toggle

Clicking butterfly icon toggles between:

- Symmetry Off
- Last Used Symmetry
