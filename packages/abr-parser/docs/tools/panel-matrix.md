# Tool Panel Availability Matrix

This document defines which brush settings panels are available for each Photoshop tool. This is **tool metadata** that informs UI behavior in brush editors.

> **Note:** Panel availability affects which settings can be edited per tool, but all settings are stored in the same ABR brush definition. Tools simply show/hide panels based on their capabilities.

## Main Settings Panels

Panels with expandable settings in the Brush Settings window:

| Panel           | Brush | Pencil | Mixer | Clone | History | Art History | Eraser | Blur | Sharpen | Smudge | Dodge | Burn | Sponge |
| --------------- | ----- | ------ | ----- | ----- | ------- | ----------- | ------ | ---- | ------- | ------ | ----- | ---- | ------ |
| Brush Tip Shape | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Shape Dynamics  | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Scattering      | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Texture         | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Dual Brush      | ✅    | ✅     | ❌    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Color Dynamics  | ✅    | ✅     | ❌    | ✅    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Transfer        | ✅    | ✅     | ✅\*  | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Brush Pose      | ✅    | ✅     | ✅    | ✅    | ✅      | ❌          | ❌     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |

\*Mixer Brush has additional Wetness Jitter and Mix Jitter in Transfer panel

## Quick Toggle Settings (Sidebar Checkboxes)

These appear as checkboxes in the left sidebar with no expanded panel:

| Setting         | Brush | Pencil | Mixer | Clone | History | Art History | Eraser | Blur | Sharpen | Smudge | Dodge | Burn | Sponge |
| --------------- | ----- | ------ | ----- | ----- | ------- | ----------- | ------ | ---- | ------- | ------ | ----- | ---- | ------ |
| Noise           | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Wet Edges       | ✅    | ✅     | ❌    | ✅    | ✅      | ✅          | ✅     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Build-up        | ✅    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Smoothing       | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Protect Texture | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |

## Toolbar Options

Per-tool toolbar options:

| Option        | Brush | Pencil | Mixer | Clone | History | Art History | Eraser | Blur | Sharpen | Smudge | Dodge | Burn | Sponge |
| ------------- | ----- | ------ | ----- | ----- | ------- | ----------- | ------ | ---- | ------- | ------ | ----- | ---- | ------ |
| Opacity       | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Flow          | ✅    | ❌     | ✅    | ✅    | ✅      | ✅          | ✅     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Smoothing     | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Airbrush Mode | ✅    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Pressure Size | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ✅     | ✅   | ✅      | ✅     | ✅    | ✅   | ✅     |
| Symmetry      | ✅    | ✅     | ✅    | ❌    | ❌      | ❌          | ✅     | ❌   | ❌      | ❌     | ❌    | ❌   | ❌     |
| Blend Mode    | ✅    | ✅     | ✅    | ✅    | ✅      | ✅          | ❌     | ✅   | ✅      | ✅     | ❌    | ❌   | ❌     |
| Strength      | ❌    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ✅   | ✅      | ✅     | ❌    | ❌   | ❌     |
| Exposure      | ❌    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ✅    | ✅   | ❌     |
| Range         | ❌    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ✅    | ✅   | ❌     |
| Flow (Sponge) | ❌    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ❌    | ❌   | ✅     |
| Mode (Sponge) | ❌    | ❌     | ❌    | ❌    | ❌      | ❌          | ❌     | ❌   | ❌      | ❌     | ❌    | ❌   | ✅     |

## Tool-Specific Settings

### Clone Stamp / History Brush

- **Aligned** - Checkbox for sample alignment
- **Sample** - Dropdown: `Current Layer` | `Current & Below` | `All Layers`

### Mixer Brush Transfer Panel

Mixer Brush has additional jitter options in Transfer:

- **Wetness Jitter** - 0-100% with control
- **Mix Jitter** - 0-100% with control

### Art History Brush

- **Style** - Dropdown for stroke style
- **Area** - Pixel area for coverage
- **Tolerance** - Match tolerance percentage

### Eraser Tool

- **Mode** - Dropdown: `Brush` | `Pencil` | `Block`
- No blend modes (uses alpha instead)

### Blur/Sharpen/Smudge

- **Strength** - 0-100% (replaces opacity)
- Smudge has additional: **Finger Painting** checkbox

### Dodge/Burn

- **Range** - Dropdown: `Shadows` | `Midtones` | `Highlights`
- **Exposure** - 0-100%
- **Protect Tones** - Checkbox

### Sponge

- **Mode** - Dropdown: `Saturate` | `Desaturate`
- **Flow** - 0-100%
- **Vibrance** - Checkbox

## TypeScript Tool Configuration

```typescript
// Suggested implementation for tool configuration
import type { ToolType } from './types';

export const ToolPanelConfig: Record<
  ToolType,
  {
    panels: string[];
    toggles: string[];
    toolbar: string[];
  }
> = {
  brush: {
    panels: [
      'brushTipShape',
      'shapeDynamics',
      'scattering',
      'texture',
      'dualBrush',
      'colorDynamics',
      'transfer',
      'brushPose'
    ],
    toggles: ['noise', 'wetEdges', 'buildup', 'smoothing', 'protectTexture'],
    toolbar: ['opacity', 'flow', 'smoothing', 'airbrush', 'pressureSize', 'symmetry', 'blendMode']
  },
  pencil: {
    panels: [
      'brushTipShape',
      'shapeDynamics',
      'scattering',
      'texture',
      'dualBrush',
      'colorDynamics',
      'transfer',
      'brushPose'
    ],
    toggles: ['noise', 'wetEdges', 'smoothing', 'protectTexture'],
    toolbar: ['opacity', 'smoothing', 'pressureSize', 'symmetry', 'blendMode']
  },
  mixer: {
    panels: ['brushTipShape', 'shapeDynamics', 'scattering', 'texture', 'transfer', 'brushPose'],
    toggles: ['noise', 'smoothing', 'protectTexture'],
    toolbar: ['opacity', 'flow', 'smoothing', 'pressureSize', 'symmetry', 'blendMode']
  }
  // ... other tools
};
```

## ABR Storage Notes

All brush settings are stored in ABR regardless of tool availability:

- ABR files contain the **complete brush definition**
- Tools simply filter which panels/settings are shown
- Switching tools doesn't modify the stored brush data
- Settings for unavailable panels are preserved but hidden
