# Brush Tool

The primary painting tool in Photoshop, offering the most comprehensive brush settings.

## Toolbar Options

![Brush Tool Toolbar](./Brush%20Tool%20-%20Toolbar.png)

| Setting                  | Type           | Range                                    | Default | Description                                          |
| ------------------------ | -------------- | ---------------------------------------- | ------- | ---------------------------------------------------- |
| **Mode**                 | Dropdown       | [Blend Modes](../_Common/Blend-Modes.md) | Normal  | Painting blend mode                                  |
| **Opacity**              | Slider + Input | 0% - 100%                                | 100%    | Overall stroke opacity                               |
| **Flow**                 | Slider + Input | 0% - 100%                                | 100%    | Paint amount per stamp                               |
| **Smoothing**            | Input          | 0% - 100%                                | 0%      | Stroke smoothing amount                              |
| **Smoothing Options**    | Gear icon (⚙️) | -                                        | -       | [Smoothing Options](../_Common/Smoothing-Options.md) |
| **Pressure for Opacity** | Toggle button  | On/Off                                   | Off     | Use pen pressure for opacity                         |
| **Pressure for Size**    | Toggle button  | On/Off                                   | Off     | Use pen pressure for size                            |
| **Angle**                | Display        | 0° - 360°                                | 0°      | Shows current brush angle                            |
| **Symmetry**             | Butterfly icon | -                                        | Off     | [Symmetry Options](../_Common/Symmetry-Options.md)   |

### Toolbar Icons (Left to Right)

1. **Tool preset picker** - Save/load tool presets
2. **Brush preset picker** - Quick brush selection with size slider
3. **Mode dropdown** - Blend mode selection
4. **Opacity** - With pressure toggle button
5. **Flow** - With pressure toggle button (airbrush icon)
6. **Smoothing** - With gear icon for options
7. **Angle display** - Current brush angle
8. **Symmetry** - Butterfly icon for symmetry options

## Brush Settings Panel

### Available Panels

All panels are available for Brush Tool:

| Panel           | Checkbox | Lock | Description                                      |
| --------------- | -------- | ---- | ------------------------------------------------ |
| Brush Tip Shape | -        | -    | [Brush Tip Shape](../_Common/Brush-Tip-Shape.md) |
| Shape Dynamics  | ✅       | 🔒   | [Shape Dynamics](../_Common/Shape-Dynamics.md)   |
| Scattering      | ✅       | 🔒   | [Scattering](../_Common/Scattering.md)           |
| Texture         | ✅       | 🔒   | [Texture](../_Common/Texture.md)                 |
| Dual Brush      | ✅       | 🔒   | [Dual Brush](../_Common/Dual-Brush.md)           |
| Color Dynamics  | ✅       | 🔒   | [Color Dynamics](../_Common/Color-Dynamics.md)   |
| Transfer        | ✅       | 🔒   | [Transfer](../_Common/Transfer.md)               |
| Brush Pose      | ✅       | 🔒   | [Brush Pose](../_Common/Brush-Pose.md)           |

### Quick Toggles (Checkbox Only)

These are simple on/off toggles without dedicated settings panels:

| Setting         | Checkbox | Lock | Description                                  |
| --------------- | -------- | ---- | -------------------------------------------- |
| Noise           | ✅       | 🔒   | Adds grain/noise to brush edges              |
| Wet Edges       | ✅       | 🔒   | Creates watercolor-like edge buildup         |
| Build-up        | ✅       | 🔒   | Enables opacity accumulation (airbrush mode) |
| Smoothing       | ✅       | 🔒   | Enables stroke smoothing                     |
| Protect Texture | ✅       | -    | Uses same texture for all brushes            |

### Lock Icons (🔒)

- Prevents the setting from changing when switching brush presets
- Useful for maintaining preferred dynamics across different brushes

## Opacity vs Flow vs Build-up

Understanding the interaction:

| Opacity | Flow | Build-up | Behavior                                            |
| ------- | ---- | -------- | --------------------------------------------------- |
| 50%     | 100% | OFF      | Uniform 50% stroke, no buildup                      |
| 50%     | 100% | ON       | Starts 50%, builds to 100% with overlap             |
| 100%    | 25%  | OFF      | Builds from 25% to 100% within stroke               |
| 100%    | 25%  | ON       | Same as above (Build-up mainly affects opacity cap) |

## Brush Tool-Specific Features

### Airbrush Mode (Build-up)

When Build-up is enabled:

- Holding brush stationary continues applying paint
- Opacity accumulates over time
- Flow controls rate of accumulation

### Wet Edges Effect

Creates darker edges like watercolor:

- Paint accumulates at stroke edges
- Center of stroke is lighter
- Effect visible with lower opacity settings

### Noise

Adds texture/grain to brush:

- Randomizes edge pixels
- More visible with soft brushes
- Creates organic, textured strokes

## Pressure Toggle Buttons

The toolbar has two quick-toggle buttons for pressure sensitivity:

### Pressure for Opacity (📱 icon with gradient)

- **ON:** Pen pressure controls opacity
- **OFF:** Opacity uses toolbar value only
- **Overrides:** Transfer > Opacity Jitter > Control

### Pressure for Size (📱 icon with circles)

- **ON:** Pen pressure controls brush size
- **OFF:** Size uses Brush Tip Shape value only
- **Overrides:** Shape Dynamics > Size Jitter > Control

## Keyboard Shortcuts

| Shortcut                   | Action                                          |
| -------------------------- | ----------------------------------------------- |
| `B`                        | Select Brush Tool                               |
| `[`                        | Decrease brush size                             |
| `]`                        | Increase brush size                             |
| `Shift + [`                | Decrease brush hardness                         |
| `Shift + ]`                | Increase brush hardness                         |
| `0-9`                      | Set opacity (0=100%, 1=10%, etc.)               |
| `Shift + 0-9`              | Set flow                                        |
| `Alt + Right-click + Drag` | Resize brush (horizontal) / hardness (vertical) |
| `Caps Lock`                | Toggle precise cursor                           |

## Saving Brush Presets

When saving a Brush Tool preset, options include:

- **Capture Brush Size in Preset** - Saves current size
- **Include Tool Settings** - Saves blend mode, opacity, flow, etc.
- **Include Color** - Saves current foreground color with brush

## Implementation Priority

For web editor, implement in this order:

1. **Essential (MVP)**
   - Brush Tip Shape (all settings)
   - Opacity & Flow (toolbar)
   - Size with keyboard shortcuts

2. **Core Dynamics**
   - Shape Dynamics
   - Transfer
   - Scattering

3. **Advanced**
   - Texture
   - Dual Brush
   - Color Dynamics

4. **Polish**
   - Brush Pose
   - Smoothing with all options
   - Symmetry
   - Quick toggles (Noise, Wet Edges, Build-up)
