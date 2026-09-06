# Clone Stamp Tool

A tool for copying pixels from one area (source) to another, useful for retouching, removing objects, and duplicating elements.

## Toolbar Options

![Clone Stamp Tool Toolbar](./Clone%20Stamp%20Tool%20-%20Toolbar.png)

| Setting                      | Type           | Range                                    | Default       | Description                                        |
| ---------------------------- | -------------- | ---------------------------------------- | ------------- | -------------------------------------------------- |
| **Clone Source**             | Toggle buttons | Source 1-5                               | Source 1      | Select which clone source to use (up to 5 sources) |
| **Mode**                     | Dropdown       | [Blend Modes](../_Common/Blend-Modes.md) | Normal        | Painting blend mode                                |
| **Opacity**                  | Slider + Input | 0% - 100%                                | 100%          | Overall stroke opacity                             |
| **Flow**                     | Slider + Input | 0% - 100%                                | 100%          | Paint flow rate                                    |
| **Airbrush Mode**            | Toggle button  | On/Off                                   | Off           | Enable airbrush-style buildup                      |
| **Angle**                    | Display        | 0° - 360°                                | 0°            | Shows current brush angle                          |
| **Aligned**                  | Checkbox       | On/Off                                   | On            | Keep source position aligned with brush            |
| **Sample**                   | Dropdown       | See options                              | Current Layer | Which layers to sample from                        |
| **Ignore Adjustment Layers** | Button         | On/Off                                   | Off           | Ignore adjustment layers when sampling             |

### Clone Source Buttons

Up to 5 independent clone sources can be stored:

- Click a source button to select it
- Alt+Click on canvas to set that source's sample point
- Switch between sources to clone from different areas

### Aligned Option

| Aligned | Behavior                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| **ON**  | Source point moves with brush - maintains relative offset. Release and paint again, source continues from where it left off |
| **OFF** | Source point resets to original sample point each time you release and paint again                                          |

### Sample Options

| Option            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `Current Layer`   | Sample only from the active layer                |
| `Current & Below` | Sample from active layer and all layers below it |
| `All Layers`      | Sample from all visible layers (merged)          |

## Brush Settings Panel

### Available Panels

| Panel           | Checkbox | Lock | Status                                              |
| --------------- | -------- | ---- | --------------------------------------------------- |
| Brush Tip Shape | -        | -    | ✅ [Brush Tip Shape](../_Common/Brush-Tip-Shape.md) |
| Shape Dynamics  | ✅       | 🔒   | ✅ [Shape Dynamics](../_Common/Shape-Dynamics.md)   |
| Scattering      | ✅       | 🔒   | ✅ [Scattering](../_Common/Scattering.md)           |
| Texture         | ✅       | 🔒   | ✅ [Texture](../_Common/Texture.md)                 |
| Dual Brush      | ✅       | 🔒   | ✅ [Dual Brush](../_Common/Dual-Brush.md)           |
| Color Dynamics  | -        | -    | ❌ DISABLED                                         |
| Transfer        | ✅       | 🔒   | ✅ [Transfer](../_Common/Transfer.md)               |
| Brush Pose      | ✅       | 🔒   | ✅ [Brush Pose](../_Common/Brush-Pose.md)           |

### Quick Toggles

| Setting         | Available   | Description                      |
| --------------- | ----------- | -------------------------------- |
| Noise           | ✅          | Adds grain to brush edges        |
| Wet Edges       | ✅          | Watercolor edge effect           |
| Build-up        | ✅          | Enable airbrush-style buildup    |
| Smoothing       | ❌ DISABLED | Not available for Clone Stamp    |
| Protect Texture | ✅          | Use same texture for all brushes |

## Transfer Panel

Clone Stamp has standard Transfer options (no Wetness/Mix):

| Setting        | Status      | Notes                      |
| -------------- | ----------- | -------------------------- |
| Opacity Jitter | ✅ ENABLED  | Controls opacity variation |
| Flow Jitter    | ✅ ENABLED  | Controls flow variation    |
| Wetness Jitter | ❌ DISABLED | Mixer Brush only           |
| Mix Jitter     | ❌ DISABLED | Mixer Brush only           |

## Why Panels Are Disabled

### Color Dynamics: ❌

- Clone Stamp copies existing pixels from source
- It doesn't apply foreground/background colors
- Color jitter would have no meaning

### Smoothing: ❌

- Clone Stamp requires precise positioning for source alignment
- Smoothing would interfere with accurate cloning

## Clone Source Panel

Photoshop has a separate Clone Source panel (Window > Clone Source) with advanced options:

| Setting             | Description                       |
| ------------------- | --------------------------------- |
| **Offset X/Y**      | Numeric offset from sample point  |
| **Width/Height %**  | Scale the cloned content          |
| **Angle**           | Rotate the cloned content         |
| **Show Overlay**    | Preview source content over brush |
| **Overlay Opacity** | Transparency of preview overlay   |
| **Clipped**         | Clip overlay to brush size        |
| **Auto Hide**       | Hide overlay while painting       |
| **Invert**          | Invert overlay colors             |

_Note: Clone Source panel features may be out of scope for initial web editor implementation._

## Keyboard Shortcuts

| Shortcut      | Action                  |
| ------------- | ----------------------- |
| `S`           | Select Clone Stamp Tool |
| `Alt + Click` | Set clone source point  |
| `[`           | Decrease brush size     |
| `]`           | Increase brush size     |
| `0-9`         | Set opacity             |
| `Shift + 0-9` | Set flow                |

## Implementation Notes

### Clone Source Sampling

```typescript
interface CloneSource {
  sourcePoint: { x: number; y: number };
  sourceLayer: Layer | 'current' | 'currentAndBelow' | 'all';
  isSet: boolean;
}

function getClonePixel(
  brushX: number,
  brushY: number,
  source: CloneSource,
  aligned: boolean,
  strokeStartOffset?: { x: number; y: number }
): Color {
  let sourceX: number, sourceY: number;

  if (aligned) {
    // Maintain relative offset from initial sample
    sourceX = brushX + source.offsetX;
    sourceY = brushY + source.offsetY;
  } else {
    // Always sample relative to original source point
    sourceX = source.sourcePoint.x + (brushX - strokeStartOffset.x);
    sourceY = source.sourcePoint.y + (brushY - strokeStartOffset.y);
  }

  return samplePixel(sourceX, sourceY, source.sourceLayer);
}
```

### Aligned vs Non-Aligned Behavior

**Aligned = ON:**

```
First stroke:
  Source: ●----→ (moves with brush)
  Brush:  ○----→

Second stroke (new location):
  Source: ●----→ (continues from previous end)
  Brush:  ○----→
```

**Aligned = OFF:**

```
First stroke:
  Source: ●----→ (moves with brush)
  Brush:  ○----→

Second stroke (new location):
  Source: ●----→ (resets to original point)
  Brush:  ○----→
```

### Sample Modes Implementation

```typescript
function sampleFromLayers(x: number, y: number, mode: SampleMode): Color {
  switch (mode) {
    case 'current':
      return activeLayer.getPixel(x, y);
    case 'currentAndBelow':
      return mergeLayersBelow(activeLayer).getPixel(x, y);
    case 'all':
      return flattenAllVisible().getPixel(x, y);
  }
}
```

### Visual Feedback

- Crosshair shows current source point while painting
- Source point crosshair moves in sync with brush when Aligned is ON
- Consider overlay preview option (like Photoshop's Clone Source panel)
