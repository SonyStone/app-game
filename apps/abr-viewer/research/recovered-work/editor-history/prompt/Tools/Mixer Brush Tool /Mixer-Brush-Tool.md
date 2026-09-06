# Mixer Brush Tool

A realistic paint mixing tool that simulates wet paint behavior, allowing colors to blend on the canvas like traditional oil or acrylic painting.

## Toolbar Options

![Mixer Brush Tool Toolbar](./Mixer%20Brush%20Tool%20-%20Toolbar.png)

| Setting                | Type                  | Range       | Default | Description                                          |
| ---------------------- | --------------------- | ----------- | ------- | ---------------------------------------------------- |
| **Current Brush Load** | Color swatch + button | -           | -       | Shows/sets paint color loaded on brush               |
| **Load Brush**         | Button (folder icon)  | -           | -       | Load brush with foreground color                     |
| **Clean Brush**        | Button                | -           | -       | Clean brush (remove loaded paint)                    |
| **Preset**             | Dropdown              | See presets | Custom  | Quick wetness/mix presets                            |
| **Wet**                | Slider + Input        | 0% - 100%   | 0%      | How wet the brush is (pickup amount)                 |
| **Load**               | Slider + Input        | 0% - 100%   | 0%      | Paint amount loaded on brush                         |
| **Mix**                | Slider + Input        | 0% - 100%   | 0%      | Ratio of canvas color mixed with brush color         |
| **Flow**               | Slider + Input        | 0% - 100%   | 0%      | Paint flow rate                                      |
| **Airbrush Mode**      | Toggle button         | On/Off      | Off     | Enable airbrush-style buildup                        |
| **Smoothing**          | Input                 | 0% - 100%   | 0%      | Stroke smoothing amount                              |
| **Smoothing Options**  | Gear icon (⚙️)        | -           | -       | [Smoothing Options](../_Common/Smoothing-Options.md) |
| **Angle**              | Display               | 0° - 360°   | 0°      | Shows current brush angle                            |
| **Sample All Layers**  | Checkbox              | On/Off      | Off     | Sample colors from all visible layers                |

### Unique Toolbar Buttons

#### Current Brush Load (Color Swatch)

- Shows the color currently "loaded" on the brush
- Click to open color picker and change loaded color
- Visual indicator of paint on brush

#### Load Brush After Each Stroke

- Toggle: Automatically reload brush with foreground color after each stroke
- When OFF: Brush gradually loses paint, colors deplete

#### Clean Brush After Each Stroke

- Toggle: Automatically clean brush after each stroke
- When OFF: Previous colors remain on brush, mixing with new strokes

## Wetness Presets

The preset dropdown provides quick combinations of Wet, Load, and Mix values:

| Preset                       | Wet  | Load | Mix  | Description                  |
| ---------------------------- | ---- | ---- | ---- | ---------------------------- |
| **Dry**                      | 0%   | 100% | 0%   | No color pickup, full load   |
| **Dry, Light Load**          | 0%   | 30%  | 0%   | No pickup, light paint       |
| **Dry, Heavy Load**          | 0%   | 100% | 0%   | No pickup, heavy paint       |
| **Moist**                    | 20%  | 50%  | 20%  | Light pickup and mixing      |
| **Moist, Light Mix**         | 20%  | 30%  | 10%  | Light pickup, minimal mixing |
| **Moist, Heavy Mix**         | 20%  | 80%  | 50%  | Light pickup, heavy mixing   |
| **Wet**                      | 50%  | 50%  | 50%  | Moderate wet mixing          |
| **Wet, Light Mix**           | 50%  | 30%  | 20%  | Wet brush, light mixing      |
| **Wet, Heavy Mix**           | 50%  | 80%  | 80%  | Wet brush, heavy mixing      |
| **Very Wet**                 | 100% | 50%  | 100% | Maximum wetness              |
| **Very Wet, Light Mix**      | 100% | 30%  | 50%  | Very wet, light mixing       |
| **Very Very Wet, Heavy Mix** | 100% | 100% | 100% | Maximum everything           |
| **Custom**                   | -    | -    | -    | User-defined values          |

## Understanding Wet/Load/Mix

### Wet (Pickup)

- **0%:** Brush doesn't pick up canvas colors (dry brush)
- **100%:** Brush fully picks up colors from canvas

### Load

- **0%:** No paint on brush (spreads existing paint only)
- **100%:** Full paint load on brush

### Mix

- **0%:** Paint color stays pure, no mixing with picked-up colors
- **100%:** Full mixing between brush color and picked-up colors

### Visual Behavior

```
Wet=0%, Load=100%, Mix=0%:
Paint solid color, no color pickup (like normal brush)

Wet=100%, Load=0%, Mix=100%:
Smear/spread existing canvas colors (no new paint)

Wet=50%, Load=50%, Mix=50%:
Balanced wet painting - picks up, deposits, and mixes
```

## Brush Settings Panel

### Available Panels

| Panel           | Checkbox | Lock | Status                                                     |
| --------------- | -------- | ---- | ---------------------------------------------------------- |
| Brush Tip Shape | -        | -    | ✅ [Brush Tip Shape](../_Common/Brush-Tip-Shape.md)        |
| Shape Dynamics  | ✅       | 🔒   | ✅ [Shape Dynamics](../_Common/Shape-Dynamics.md)          |
| Scattering      | ✅       | 🔒   | ✅ [Scattering](../_Common/Scattering.md)                  |
| Texture         | ✅       | 🔒   | ✅ [Texture](../_Common/Texture.md)                        |
| Dual Brush      | -        | -    | ❌ DISABLED                                                |
| Color Dynamics  | -        | -    | ❌ DISABLED                                                |
| Transfer        | ✅       | 🔒   | ✅ [Transfer](../_Common/Transfer.md) (special, see below) |
| Brush Pose      | ✅       | 🔒   | ✅ [Brush Pose](../_Common/Brush-Pose.md)                  |

### Quick Toggles

| Setting         | Available   | Description                            |
| --------------- | ----------- | -------------------------------------- |
| Noise           | ❌ DISABLED | Not available for Mixer Brush          |
| Wet Edges       | ❌ DISABLED | Not available (has its own wet system) |
| Build-up        | ✅          | Enable airbrush-style buildup          |
| Smoothing       | ✅          | Enable stroke smoothing                |
| Protect Texture | ❌          | Available but not checked by default   |

## Transfer Panel (Special)

Mixer Brush has a unique Transfer configuration:

| Setting        | Status      | Notes                                        |
| -------------- | ----------- | -------------------------------------------- |
| Opacity Jitter | ❌ DISABLED | Mixer Brush doesn't use opacity the same way |
| Flow Jitter    | ✅ ENABLED  | Controls flow variation                      |
| Wetness Jitter | ✅ ENABLED  | **Unique to Mixer Brush**                    |
| Mix Jitter     | ✅ ENABLED  | **Unique to Mixer Brush**                    |

### Wetness Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in wetness (pickup amount)
- **Control:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]

### Mix Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Effect:** Random variation in color mixing ratio
- **Control:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]

## Why Panels Are Disabled

### Dual Brush: ❌

- Mixer Brush's color pickup/mixing system is incompatible with dual brush masking
- Would create unpredictable color interactions

### Color Dynamics: ❌

- Mixer Brush already has complex color behavior via wet mixing
- FG/BG jitter would conflict with paint mixing logic

### Noise: ❌

- Would interfere with realistic paint simulation

### Wet Edges: ❌

- Mixer Brush has its own wetness system
- Traditional wet edges effect doesn't apply

## Include Color

Like Brush Tool, Mixer Brush can save color with brush presets:

- **Include Color** option available when saving preset
- Stores the brush load color with the preset

## Keyboard Shortcuts

| Shortcut       | Action                                 |
| -------------- | -------------------------------------- |
| `B` then cycle | Cycle to Mixer Brush Tool              |
| `[`            | Decrease brush size                    |
| `]`            | Increase brush size                    |
| `Alt + Click`  | Sample color from canvas to brush load |

## Implementation Notes

### Paint Mixing Algorithm

Conceptual approach for wet paint mixing:

```typescript
interface BrushState {
  loadedColor: Color;
  loadAmount: number; // 0-1, depletes as you paint
}

function mixerBrushStroke(
  canvasColor: Color,
  brushState: BrushState,
  wet: number, // 0-1
  load: number, // 0-1
  mix: number // 0-1
): { outputColor: Color; newBrushState: BrushState } {
  // Pick up canvas color based on wetness
  const pickedUpColor = wet > 0 ? lerpColor(brushState.loadedColor, canvasColor, wet) : brushState.loadedColor;

  // Mix picked up color with brush load
  const mixedColor = mix > 0 ? lerpColor(brushState.loadedColor, pickedUpColor, mix) : brushState.loadedColor;

  // Output color based on load amount
  const outputColor = lerpColor(canvasColor, mixedColor, load * brushState.loadAmount);

  // Update brush state (paint depletes, picks up canvas color)
  const newBrushState = {
    loadedColor: mixedColor,
    loadAmount: Math.max(0, brushState.loadAmount - depletionRate)
  };

  return { outputColor, newBrushState };
}
```

### Sample All Layers

When enabled:

- Color pickup samples from merged visible layers
- Painted output still goes to active layer only
- Useful for mixing colors across multiple layers

### Performance Considerations

Mixer Brush is computationally expensive:

- Per-pixel color calculations
- Brush state tracking throughout stroke
- Consider optimizations for real-time preview

### Reservoir System

The brush acts like a paint reservoir:

- Load fills the reservoir
- Painting depletes the reservoir
- Wet picks up and mixes into reservoir
- "Clean Brush" empties reservoir
- "Load Brush" refills with foreground color
