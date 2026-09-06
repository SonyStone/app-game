# ABR Parser Documentation

This documentation covers the Adobe Photoshop Brush (`.abr`) file format and all brush settings that can be stored in ABR files.

## Overview

ABR files store brush presets including:

- Brush tip images (sampled brushes)
- Brush parameters (computed brushes)
- Dynamics settings (shape, scatter, texture, etc.)
- Tool-specific metadata

## Quick Links

| Category            | Documents                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Settings Panels** | [Brush Tip Shape](./settings/brush-tip-shape.md) · [Shape Dynamics](./settings/shape-dynamics.md) · [Scattering](./settings/scattering.md) · [Texture](./settings/texture.md) · [Dual Brush](./settings/dual-brush.md) · [Color Dynamics](./settings/color-dynamics.md) · [Transfer](./settings/transfer.md) · [Brush Pose](./settings/brush-pose.md) |
| **Reference**       | [Control Options](./settings/control-options.md) · [Blend Modes](./reference/blend-modes.md) · [Non-Linear Sliders](./reference/non-linear-sliders.md)                                                                                                                                                                                                |
| **Tool Metadata**   | [Panel Matrix](./tools/panel-matrix.md) · [Smoothing Options](./settings/smoothing-options.md) · [Symmetry Options](./settings/symmetry-options.md)                                                                                                                                                                                                   |

## Documentation Structure

```
docs/
├── README.md                    # This file
├── settings/                    # Brush Settings Panels (stored in ABR)
│   ├── brush-tip-shape.md       # Base brush shape and spacing
│   ├── shape-dynamics.md        # Size, angle, roundness variation
│   ├── scattering.md            # Brush mark distribution
│   ├── texture.md               # Pattern texture application
│   ├── dual-brush.md            # Secondary brush combination
│   ├── color-dynamics.md        # Color variation during stroke
│   ├── transfer.md              # Opacity and flow dynamics
│   ├── brush-pose.md            # Manual stylus input override
│   ├── control-options.md       # Dynamic control types reference
│   ├── smoothing-options.md     # Stroke smoothing (tool metadata)
│   └── symmetry-options.md      # Symmetry painting (tool metadata)
├── reference/                   # General Reference
│   ├── blend-modes.md           # Paint blending modes
│   └── non-linear-sliders.md    # UI slider mapping curves
└── tools/                       # Tool-Specific Information
    └── panel-matrix.md          # Panel availability per tool
```

## Brush Settings Panels

Settings that can be stored in ABR files:

| Panel                                            | Description                      | TypeScript Reference                        |
| ------------------------------------------------ | -------------------------------- | ------------------------------------------- |
| [Brush Tip Shape](./settings/brush-tip-shape.md) | Base brush shape and spacing     | `ZBrush.diameter`, `spacing`, `angle`, etc. |
| [Shape Dynamics](./settings/shape-dynamics.md)   | Size, angle, roundness variation | `ZShapeDynamics`                            |
| [Scattering](./settings/scattering.md)           | Brush mark distribution          | `ZScattering`                               |
| [Texture](./settings/texture.md)                 | Pattern texture application      | `ZTexture`                                  |
| [Dual Brush](./settings/dual-brush.md)           | Secondary brush combination      | `ZDualBrush`                                |
| [Color Dynamics](./settings/color-dynamics.md)   | Color variation during stroke    | `ZColorDynamics`                            |
| [Transfer](./settings/transfer.md)               | Opacity and flow dynamics        | `ZTransfer`                                 |
| [Brush Pose](./settings/brush-pose.md)           | Manual stylus input override     | `ZBrushPose`                                |

### Quick Toggle Settings (Sidebar Checkboxes)

These are stored as boolean flags in ABR:

- **Noise** - Adds grain to brush edges
- **Wet Edges** - Watercolor edge effect
- **Build-up** - Airbrush opacity accumulation
- **Smoothing** - Enable stroke smoothing
- **Protect Texture** - Use same texture for all brushes

## Reference Documentation

- [Control Options](./settings/control-options.md) - Dynamic control types (Pen Pressure, Tilt, etc.)
- [Blend Modes](./reference/blend-modes.md) - Paint blending modes and ABR keys
- [Non-Linear Sliders](./reference/non-linear-sliders.md) - UI slider mapping curves for Size/Spacing

## Tool Metadata

Some settings are per-tool preferences, not stored in ABR:

- [Tool Panel Matrix](./tools/panel-matrix.md) - Which panels are available per tool
- [Smoothing Options](./settings/smoothing-options.md) - Stroke smoothing (runtime setting)
- [Symmetry Options](./settings/symmetry-options.md) - Symmetry painting (runtime setting)

## TypeScript Types

All brush settings have corresponding TypeScript types in [`src/types.ts`](../src/types.ts):

```typescript
import {
  Brush,
  BrushType,
  ZBrushAngle, // -179 to 180 degrees (brush tip angle)
  ZRotation, // 0 to 360 degrees (brush pose rotation)
  SizeControlType, // Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel
  AngleControlType, // SizeControlType + Rotation, Initial Direction, Direction
  RoundnessControlType // SizeControlType + Rotation
} from '@anthropic/abr-parser';
```

## Descriptor Keys

Photoshop uses 4-character keys for brush properties. See [`src/descriptor-keys.ts`](../src/descriptor-keys.ts) for mappings:

```typescript
import {
  BrushDefinitionKeys, // Dmtr, Hrdn, Angl, Rndn, Spcn, etc.
  ShapeDynamicsKeys, // szJt, anglJitter, rndnJitter, etc.
  ScatteringKeys, // Sctr, Cnt, bothAxes, etc.
  TextureKeys, // Txtr, Scl, textureDepth, etc.
  DualBrushKeys, // dualBrush, useDualBrush, etc.
  ColorDynamicsKeys, // clrN, Hue, Strt (saturation), Brgh, Prty, etc.
  TransferKeys, // Opct, opacityJitter, FlwJ, wetJitter, etc.
  BrushPoseKeys, // overridePoseAngle, overridePosePressure, etc.
  ControlTypeValues, // strokeDynamicsOff → 'off', etc.
  BlendModeValues // Nrml → 'normal', Mltp → 'multiply', etc.
} from '@anthropic/abr-parser';
```

## Related Files

- [`src/types.ts`](../src/types.ts) - Zod schemas and TypeScript types
- [`src/descriptor-keys.ts`](../src/descriptor-keys.ts) - Photoshop key mappings
- [`src/abr-parser.ts`](../src/abr-parser.ts) - ABR file parsing
- [`src/abr-writer.ts`](../src/abr-writer.ts) - ABR file writing
- [`src/descriptor-parser.ts`](../src/descriptor-parser.ts) - Descriptor parsing
- [`src/descriptor-serializer.ts`](../src/descriptor-serializer.ts) - Descriptor serialization
- [`task-prompt.md`](../task-prompt.md) - Implementation task for full brush settings support
