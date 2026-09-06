# Dual Brush

Dual Brush combines two brush tips, using a second brush to mask/modulate the primary brush.

**Panel Checkbox:** Can be enabled/disabled for the brush
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Mode

- **Type:** Dropdown
- **Options:** [Multiply, Darken, Overlay, Color Dodge, Color Burn, Linear Burn, Linear Dodge, Hard Mix, Subtract, Difference]
- **Default:** Multiply
- **Effect:** How the two brush tips are blended together

| Mode           | Effect                                        |
| -------------- | --------------------------------------------- |
| `Multiply`     | Second brush darkens/masks the first          |
| `Darken`       | Uses darker values from either brush          |
| `Overlay`      | Combines multiply/screen based on first brush |
| `Color Dodge`  | Second brush lightens the first               |
| `Color Burn`   | Second brush darkens with increased contrast  |
| `Linear Burn`  | Linear darkening combination                  |
| `Linear Dodge` | Linear lightening combination                 |
| `Hard Mix`     | High contrast combination                     |
| `Subtract`     | Subtracts second brush from first             |
| `Difference`   | Absolute difference between brushes           |

---

### Flip

- **Type:** Checkbox (inline with Mode)
- **Default:** Unchecked
- **Effect:** Flips the dual brush tip horizontally

---

### Brush Tip Selector

- **Type:** Grid of brush tip thumbnails
- **Effect:** Selects the second brush tip
- Same as primary [Brush Tip Shape](./Brush-Tip-Shape.md) selector

---

### Size

- **Type:** Slider with numeric input
- **Range:** 1 - 5000 px
- **Default:** Varies per selected brush
- **Effect:** Size of the second brush tip
- **Note:** Has reset button (circular arrow) to restore original size

---

### Spacing

- **Type:** Slider with numeric input
- **Range:** 1% - 1000%
- **Default:** 25%
- **Effect:** Spacing between second brush stamps

---

### Scatter

- **Type:** Slider with numeric input
- **Range:** 0% - 1000%
- **Default:** 0%
- **Effect:** Scatter amount for second brush

#### Both Axes

- **Type:** Checkbox (inline with Scatter label)
- **Default:** Unchecked
- **Effect:** Scatter in both X and Y directions

---

### Count

- **Type:** Slider with numeric input
- **Range:** 1 - 16
- **Default:** 1
- **Effect:** Number of second brush marks per interval

## Visual Explanation

```
Primary Brush:     ████████
                   ████████
                   ████████

Dual Brush:          ▓▓
                      ▓▓▓
                     ▓▓

Result (Multiply):   ██▓▓██
                    ██▓▓▓██
                    ███▓▓██
```

The dual brush creates holes/texture in the primary brush based on where it overlaps.

## Key Differences from Primary Brush

| Feature        | Primary Brush | Dual Brush                       |
| -------------- | ------------- | -------------------------------- |
| Shape Dynamics | Full controls | None                             |
| Scattering     | Full controls | Simplified (Scatter, Count only) |
| Texture        | Available     | Not available                    |
| Color Dynamics | Available     | Not available                    |
| Transfer       | Available     | Not available                    |

## Implementation Notes

### Dual Brush Rendering

1. Render primary brush stroke
2. For each primary brush mark position:
   - Calculate dual brush positions (with scatter, count)
   - Apply dual brush as mask using selected blend mode
3. The dual brush essentially "cuts into" or modifies the primary brush

### Uploading New Brush Tip

Need to support:

- Selecting existing brush from brush library
- Importing new brush tip image for dual brush
- Converting grayscale image to brush tip

### Performance

Dual brush effectively doubles (or more with Count > 1) the rendering work. Consider optimization for real-time preview.

### No Checkbox for Spacing

Unlike primary Brush Tip Shape, Dual Brush spacing is always enabled (no checkbox to disable).
