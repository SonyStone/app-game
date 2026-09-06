# Art History Brush Tool

A stylized painting tool that creates artistic brush strokes based on a history state, transforming photos into painterly images.

## Toolbar Options

![Art History Brush Tool Toolbar](./Art%20History%20Brush%20Tool%20-%20Toolbar.png)

| Setting       | Type           | Range                                    | Default     | Description                                      |
| ------------- | -------------- | ---------------------------------------- | ----------- | ------------------------------------------------ |
| **Mode**      | Dropdown       | [Blend Modes](../_Common/Blend-Modes.md) | Normal      | Painting blend mode                              |
| **Opacity**   | Slider + Input | 0% - 100%                                | 100%        | Overall stroke opacity                           |
| **Style**     | Dropdown       | See styles                               | Tight Short | Brush stroke style                               |
| **Area**      | Input          | 0 - 500 px                               | ?           | Area covered by brush strokes                    |
| **Tolerance** | Slider + Input | 0% - 100%                                | ?           | Limits painting to areas that differ from source |
| **Angle**     | Display        | 0° - 360°                                | 0°          | Shows current brush angle                        |

### Style Options

The Style dropdown controls the character of the brush strokes:

| Style               | Description                                         |
| ------------------- | --------------------------------------------------- |
| **Tight Short**     | Small, controlled strokes that follow edges closely |
| **Tight Medium**    | Medium-length controlled strokes                    |
| **Tight Long**      | Long controlled strokes                             |
| **Loose Medium**    | Medium strokes with more variation                  |
| **Loose Long**      | Long strokes with loose, flowing character          |
| **Dab**             | Single dab marks, stippling effect                  |
| **Tight Curl**      | Short curled/spiraling strokes                      |
| **Tight Curl Long** | Long curled strokes                                 |
| **Loose Curl**      | Loose, swirling strokes                             |
| **Loose Curl Long** | Long, loose swirling strokes                        |

### Style Categories

| Category  | Styles                   | Character                      |
| --------- | ------------------------ | ------------------------------ |
| **Tight** | Short, Medium, Long      | Follows image detail closely   |
| **Loose** | Medium, Long             | More painterly, less precise   |
| **Dab**   | Dab                      | Pointillist/stipple effect     |
| **Curl**  | Tight/Loose × Short/Long | Swirling Van Gogh-like strokes |

### Area Setting

- **Type:** Numeric input
- **Range:** 0 - 500 px
- **Effect:** Controls the area that each brush stroke covers
- Larger values = bigger, more sweeping strokes
- Smaller values = more detailed, controlled strokes

### Tolerance Setting

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Effect:** Limits where paint is applied based on color difference from source
- **0%:** Paint anywhere (no restriction)
- **100%:** Only paint where colors differ significantly from source
- Useful for protecting certain colors or creating selective effects

## Brush Settings Panel

### Available Panels

| Panel           | Checkbox | Lock | Status                                                      |
| --------------- | -------- | ---- | ----------------------------------------------------------- |
| Brush Tip Shape | -        | -    | ✅ [Brush Tip Shape](../_Common/Brush-Tip-Shape.md)         |
| Shape Dynamics  | ✅       | 🔒   | ✅ [Shape Dynamics](../_Common/Shape-Dynamics.md)           |
| Scattering      | -        | -    | ❌ DISABLED                                                 |
| Texture         | ✅       | 🔒   | ✅ [Texture](../_Common/Texture.md)                         |
| Dual Brush      | -        | -    | ❌ DISABLED                                                 |
| Color Dynamics  | ✅       | 🔒   | ✅ [Color Dynamics](../_Common/Color-Dynamics.md) (partial) |
| Transfer        | ✅       | 🔒   | ✅ [Transfer](../_Common/Transfer.md)                       |
| Brush Pose      | ✅       | 🔒   | ✅ [Brush Pose](../_Common/Brush-Pose.md)                   |

### Quick Toggles

| Setting         | Available   | Description                      |
| --------------- | ----------- | -------------------------------- |
| Noise           | ✅          | Adds grain to brush edges        |
| Wet Edges       | ✅          | Watercolor edge effect           |
| Build-up        | ❌ DISABLED | Not available for Art History    |
| Smoothing       | ✅          | Enable stroke smoothing          |
| Protect Texture | ✅          | Use same texture for all brushes |

## Color Dynamics (Partial)

Art History Brush has a special Color Dynamics configuration:

| Setting                      | Status      | Notes                              |
| ---------------------------- | ----------- | ---------------------------------- |
| Apply Per Tip                | ✅ ENABLED  | Available                          |
| Foreground/Background Jitter | ❌ DISABLED | Cannot apply - uses history colors |
| Hue Jitter                   | ✅ ENABLED  | Varies hue of sampled colors       |
| Saturation Jitter            | ✅ ENABLED  | Varies saturation                  |
| Brightness Jitter            | ✅ ENABLED  | Varies brightness                  |
| Purity                       | ✅ ENABLED  | Saturation bias                    |

### Why FG/BG Jitter is Disabled

- Art History Brush samples colors from the history state
- It doesn't use foreground/background colors
- Hue/Sat/Brightness jitter modifies the sampled colors

## Why Panels Are Disabled

### Scattering: ❌

- Art History Brush has its own stroke placement logic
- The Style setting controls stroke distribution
- Scattering would conflict with stylized stroke patterns

### Dual Brush: ❌

- Each Art History stroke is a complete stylized unit
- Dual brush masking doesn't fit the painterly stroke model

### Build-up: ❌

- Art History creates discrete stylized strokes
- Airbrush-style buildup doesn't apply to this effect

## History Panel Integration

Same as History Brush - see [History Brush Tool](../History%20Brush%20Tool%20/History-Brush-Tool.md#history-panel-integration)

### Setting Source State

1. Open History panel (Window > History)
2. Click empty box to LEFT of desired state
3. Art palette icon (🎨) appears as source indicator
4. Paint with Art History Brush

## Differences from History Brush

| Aspect         | History Brush          | Art History Brush       |
| -------------- | ---------------------- | ----------------------- |
| **Purpose**    | Restore pixels exactly | Create painterly effect |
| **Output**     | Original pixels        | Stylized brush strokes  |
| **Flow**       | ✅ Has Flow            | ❌ No Flow              |
| **Style**      | ❌ No Style            | ✅ 10 Style options     |
| **Area**       | ❌ No Area             | ✅ Area setting         |
| **Tolerance**  | ❌ No Tolerance        | ✅ Tolerance setting    |
| **Scattering** | ✅ Available           | ❌ Disabled             |
| **Dual Brush** | ✅ Available           | ❌ Disabled             |

## Keyboard Shortcuts

| Shortcut           | Action                     |
| ------------------ | -------------------------- |
| `Y` then `Shift+Y` | Cycle to Art History Brush |
| `[`                | Decrease brush size        |
| `]`                | Increase brush size        |
| `0-9`              | Set opacity                |

## Use Cases

### Photo to Painting

1. Open photo
2. Create snapshot (save state)
3. Fill with white or solid color
4. Paint with Art History Brush to "reveal" painterly version

### Selective Painterly Effect

1. Duplicate layer
2. Use Art History on specific areas
3. Blend with original using masks

### Impressionist Effect

- **Style:** Loose Curl Long
- **Area:** Large (100-200px)
- Creates Van Gogh-like swirling strokes

### Pointillist Effect

- **Style:** Dab
- **Size:** Small brush
- **Area:** Small
- Creates Seurat-like stippled effect

## Implementation Notes

### Stroke Generation Algorithm

```typescript
interface ArtHistoryStroke {
  style: StrokeStyle;
  area: number;
  startPoint: Point;
  color: Color; // Sampled from history
}

function generateArtHistoryStroke(
  brushPoint: Point,
  historyState: ImageData,
  style: StrokeStyle,
  area: number,
  tolerance: number
): ArtHistoryStroke[] {
  // Sample color from history at brush point
  const sourceColor = historyState.getPixel(brushPoint.x, brushPoint.y);
  const currentColor = canvas.getPixel(brushPoint.x, brushPoint.y);

  // Check tolerance
  const colorDiff = getColorDifference(sourceColor, currentColor);
  if (tolerance > 0 && colorDiff < tolerance) {
    return []; // Don't paint here
  }

  // Generate stylized strokes based on style
  return createStylizedStrokes(brushPoint, sourceColor, style, area);
}
```

### Style Implementation Concepts

| Style Type     | Algorithm Concept                   |
| -------------- | ----------------------------------- |
| **Tight**      | Follow luminosity gradients closely |
| **Loose**      | Add randomness to stroke direction  |
| **Dab**        | Single circular marks               |
| **Curl**       | Spiral/curved stroke paths          |
| **Short/Long** | Stroke length parameter             |

### Performance

Art History Brush is computationally intensive:

- Generates multiple stroke paths per brush position
- Samples colors from history state
- Consider simplifying for real-time preview
