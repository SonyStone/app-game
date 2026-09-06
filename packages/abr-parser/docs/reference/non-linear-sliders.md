# Non-Linear Slider Mapping

Some sliders in Photoshop use non-linear mapping to provide finer control at common value ranges. This applies to **UI rendering** when editing brushes, not to ABR storage (which stores actual values).

## Size Slider (Brush Tip Shape)

**ABR Key:** `masterDiameter`  
**Storage:** Actual pixel value  
**UI Range:** 1 - 5000 px

| Slider Position | Pixel Range   | Notes                    |
| --------------- | ------------- | ------------------------ |
| 0% - 50%        | 1 - 100 px    | Fine control for details |
| 50% - 75%       | 100 - 200 px  | Common brush sizes       |
| 75% - 87.5%     | 200 - 500 px  | Medium brushes           |
| 87.5% - 100%    | 500 - 5000 px | Large brushes            |

## Spacing Slider (Brush Tip Shape)

**ABR Key:** `Spcn`  
**Storage:** Actual percentage  
**UI Range:** 1% - 1000%

| Slider Position | Spacing Range | Notes                    |
| --------------- | ------------- | ------------------------ |
| 0% - 50%        | 1% - 100%     | Fine control for details |
| 50% - 75%       | 100% - 200%   | Common spacing values    |
| 75% - 87.5%     | 200% - 500%   | Larger gaps              |
| 87.5% - 100%    | 500% - 1000%  | Stamp/scatter effects    |

## Implementation

### Slider to Value Conversion

```typescript
function sliderToSize(sliderPercent: number): number {
  if (sliderPercent <= 50) {
    // 0-50% slider → 1-100px (linear within segment)
    return 1 + (sliderPercent / 50) * 99;
  } else if (sliderPercent <= 75) {
    // 50-75% slider → 100-200px
    return 100 + ((sliderPercent - 50) / 25) * 100;
  } else if (sliderPercent <= 87.5) {
    // 75-87.5% slider → 200-500px
    return 200 + ((sliderPercent - 75) / 12.5) * 300;
  } else {
    // 87.5-100% slider → 500-5000px
    return 500 + ((sliderPercent - 87.5) / 12.5) * 4500;
  }
}

function sizeToSlider(pixels: number): number {
  if (pixels <= 100) {
    return ((pixels - 1) / 99) * 50;
  } else if (pixels <= 200) {
    return 50 + ((pixels - 100) / 100) * 25;
  } else if (pixels <= 500) {
    return 75 + ((pixels - 200) / 300) * 12.5;
  } else {
    return 87.5 + ((pixels - 500) / 4500) * 12.5;
  }
}
```

### Spacing uses same curve

```typescript
function sliderToSpacing(sliderPercent: number): number {
  // Same breakpoints as size, but values are percentages
  if (sliderPercent <= 50) {
    return 1 + (sliderPercent / 50) * 99;
  } else if (sliderPercent <= 75) {
    return 100 + ((sliderPercent - 50) / 25) * 100;
  } else if (sliderPercent <= 87.5) {
    return 200 + ((sliderPercent - 75) / 12.5) * 300;
  } else {
    return 500 + ((sliderPercent - 87.5) / 12.5) * 500;
  }
}
```

## Linear Sliders

The following sliders use **LINEAR** mapping (slider position = value percentage):

| Setting             | Range         | ABR Key Reference         |
| ------------------- | ------------- | ------------------------- |
| Scatter             | 0% - 1000%    | `Sctr` (Scattering)       |
| All Jitter sliders  | 0% - 100%     | Various `*Jitter` keys    |
| All Minimum sliders | 0% - 100%     | Various `*Mn*` keys       |
| Hardness            | 0% - 100%     | `Hrdn` (Brush Tip Shape)  |
| Opacity (toolbar)   | 0% - 100%     | `Opct` (Transfer)         |
| Flow (toolbar)      | 0% - 100%     | N/A - not stored in ABR   |
| Roundness           | 1% - 100%     | `Rndns` (Brush Tip Shape) |
| Angle               | -179° to 180° | `Angl` (Brush Tip Shape)  |

## UI Considerations

### Numeric Input vs Slider

- Numeric input always shows/accepts the actual value (1-5000 px)
- Slider position uses non-linear mapping
- User can type any valid value directly
- Dragging slider uses mapped values

### Scrubby Sliders

When user drags on the numeric label (scrubby slider), consider:

- Use linear delta for intuitive feel
- Or use value-proportional delta (larger values = bigger steps)

## Related TypeScript Types

```typescript
// From types.ts - values are stored linearly, UI applies curve
import { ZBrushSize } from './types'; // 0.1 to 5000
import { ZSpacing } from './types'; // 1 to 1000

// UI helper functions would be separate from core types
```
