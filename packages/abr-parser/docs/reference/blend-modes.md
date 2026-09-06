# Blend Modes Reference

Blend modes determine how pixels are blended with underlying pixels when painting. This is **tool metadata** - blend mode availability varies by tool and is not stored in ABR brush definitions.

## ABR Descriptor Keys

```typescript
// From descriptor-keys.ts
export const BlendModeValues = {
  Nrml: 'normal',
  Dslv: 'dissolve',
  Bhnd: 'behind',
  'Clr ': 'clear',
  Drkn: 'darken',
  Mltp: 'multiply',
  CBrn: 'colorBurn',
  linearBurn: 'linearBurn',
  darkerColor: 'darkerColor',
  Lghn: 'lighten',
  Scrn: 'screen',
  CDdg: 'colorDodge',
  linearDodge: 'linearDodge',
  lighterColor: 'lighterColor',
  Ovrl: 'overlay',
  SftL: 'softLight',
  HrdL: 'hardLight',
  vividLight: 'vividLight',
  linearLight: 'linearLight',
  pinLight: 'pinLight',
  hardMix: 'hardMix',
  Dfrn: 'difference',
  Xclu: 'exclusion',
  Sbtr: 'subtract',
  'Dvd ': 'divide',
  'H   ': 'hue',
  Strt: 'saturation',
  'Clr ': 'color',
  Lmns: 'luminosity'
} as const;
```

## Available Modes

Modes are grouped by their blending behavior:

### Normal Group

| Mode     | ABR Key | Description                               |
| -------- | ------- | ----------------------------------------- |
| Normal   | `Nrml`  | Default mode, paints pixels directly      |
| Dissolve | `Dslv`  | Randomly replaces pixels based on opacity |
| Behind   | `Bhnd`  | Paints only on transparent areas          |
| Clear    | `Clr `  | Makes pixels transparent (eraser effect)  |

### Darken Group

| Mode         | ABR Key       | Description                                          |
| ------------ | ------------- | ---------------------------------------------------- |
| Darken       | `Drkn`        | Keeps darker of blend or base color                  |
| Multiply     | `Mltp`        | Multiplies base by blend color (always darker)       |
| Color Burn   | `CBrn`        | Darkens base to reflect blend by increasing contrast |
| Linear Burn  | `linearBurn`  | Darkens base by decreasing brightness                |
| Darker Color | `darkerColor` | Compares total channel values, keeps darker          |

### Lighten Group

| Mode               | ABR Key        | Description                                            |
| ------------------ | -------------- | ------------------------------------------------------ |
| Lighten            | `Lghn`         | Keeps lighter of blend or base color                   |
| Screen             | `Scrn`         | Multiplies inverse (always lighter)                    |
| Color Dodge        | `CDdg`         | Brightens base to reflect blend by decreasing contrast |
| Linear Dodge (Add) | `linearDodge`  | Brightens base by increasing brightness                |
| Lighter Color      | `lighterColor` | Compares total channel values, keeps lighter           |

### Contrast Group

| Mode         | ABR Key       | Description                                         |
| ------------ | ------------- | --------------------------------------------------- |
| Overlay      | `Ovrl`        | Multiplies or screens based on base color           |
| Soft Light   | `SftL`        | Darkens or lightens depending on blend color        |
| Hard Light   | `HrdL`        | Multiplies or screens based on blend color          |
| Vivid Light  | `vividLight`  | Burns or dodges by increasing/decreasing contrast   |
| Linear Light | `linearLight` | Burns or dodges by increasing/decreasing brightness |
| Pin Light    | `pinLight`    | Replaces colors depending on blend color            |
| Hard Mix     | `hardMix`     | Reduces colors to 8 (R,G,B,C,M,Y,W,K)               |

### Inversion Group

| Mode       | ABR Key | Description                              |
| ---------- | ------- | ---------------------------------------- |
| Difference | `Dfrn`  | Subtracts darker from lighter            |
| Exclusion  | `Xclu`  | Similar to Difference but lower contrast |
| Subtract   | `Sbtr`  | Subtracts blend from base                |
| Divide     | `Dvd `  | Divides base by blend                    |

### Component Group

| Mode       | ABR Key | Description                                             |
| ---------- | ------- | ------------------------------------------------------- |
| Hue        | `H   `  | Applies hue of blend with saturation/luminosity of base |
| Saturation | `Strt`  | Applies saturation of blend                             |
| Color      | `Clr `  | Applies hue and saturation of blend                     |
| Luminosity | `Lmns`  | Applies luminosity of blend                             |

## Tool Availability

Not all blend modes are available for all tools:

| Mode    | Brush | Pencil | Mixer | Clone | Eraser | Notes                    |
| ------- | ----- | ------ | ----- | ----- | ------ | ------------------------ |
| Behind  | ✅    | ✅     | ❌    | ❌    | ❌     | Only brush-based tools   |
| Clear   | ✅    | ✅     | ❌    | ❌    | ❌     | Only brush-based tools   |
| (other) | ✅    | ✅     | ✅    | ✅    | ❌     | Eraser has limited modes |

**Note:** Eraser tool has its own mode options (Brush, Pencil, Block) rather than blend modes.

## UI Implementation Notes

### Grouping

Modes should be visually grouped with separators matching Photoshop's organization.

### TypeScript Type

```typescript
// Suggested implementation
const BlendMode = z.enum([
  // Normal
  'normal',
  'dissolve',
  'behind',
  'clear',
  // Darken
  'darken',
  'multiply',
  'colorBurn',
  'linearBurn',
  'darkerColor',
  // Lighten
  'lighten',
  'screen',
  'colorDodge',
  'linearDodge',
  'lighterColor',
  // Contrast
  'overlay',
  'softLight',
  'hardLight',
  'vividLight',
  'linearLight',
  'pinLight',
  'hardMix',
  // Inversion
  'difference',
  'exclusion',
  'subtract',
  'divide',
  // Component
  'hue',
  'saturation',
  'color',
  'luminosity'
]);
```
