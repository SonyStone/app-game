# Blend Modes

Blend modes determine how pixels are blended with underlying pixels when painting.

## Available Modes

Modes are grouped by their blending behavior:

### Normal Group

| Mode       | Description                               |
| ---------- | ----------------------------------------- |
| `Normal`   | Default mode, paints pixels directly      |
| `Dissolve` | Randomly replaces pixels based on opacity |
| `Behind`   | Paints only on transparent areas          |
| `Clear`    | Makes pixels transparent (eraser effect)  |

### Darken Group

| Mode           | Description                                          |
| -------------- | ---------------------------------------------------- |
| `Darken`       | Keeps darker of blend or base color                  |
| `Multiply`     | Multiplies base by blend color (always darker)       |
| `Color Burn`   | Darkens base to reflect blend by increasing contrast |
| `Linear Burn`  | Darkens base by decreasing brightness                |
| `Darker Color` | Compares total channel values, keeps darker          |

### Lighten Group

| Mode                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `Lighten`            | Keeps lighter of blend or base color                   |
| `Screen`             | Multiplies inverse (always lighter)                    |
| `Color Dodge`        | Brightens base to reflect blend by decreasing contrast |
| `Linear Dodge (Add)` | Brightens base by increasing brightness                |
| `Lighter Color`      | Compares total channel values, keeps lighter           |

### Contrast Group

| Mode           | Description                                         |
| -------------- | --------------------------------------------------- |
| `Overlay`      | Multiplies or screens based on base color           |
| `Soft Light`   | Darkens or lightens depending on blend color        |
| `Hard Light`   | Multiplies or screens based on blend color          |
| `Vivid Light`  | Burns or dodges by increasing/decreasing contrast   |
| `Linear Light` | Burns or dodges by increasing/decreasing brightness |
| `Pin Light`    | Replaces colors depending on blend color            |
| `Hard Mix`     | Reduces colors to 8 (R,G,B,C,M,Y,W,K)               |

### Inversion Group

| Mode         | Description                              |
| ------------ | ---------------------------------------- |
| `Difference` | Subtracts darker from lighter            |
| `Exclusion`  | Similar to Difference but lower contrast |
| `Subtract`   | Subtracts blend from base                |
| `Divide`     | Divides base by blend                    |

### Component Group

| Mode         | Description                                             |
| ------------ | ------------------------------------------------------- |
| `Hue`        | Applies hue of blend with saturation/luminosity of base |
| `Saturation` | Applies saturation of blend                             |
| `Color`      | Applies hue and saturation of blend                     |
| `Luminosity` | Applies luminosity of blend                             |

## Implementation Notes

### Data Type

- **Type:** `enum` / `dropdown`
- **Storage:** String identifier

### Tool Availability

Not all blend modes are available for all tools:

- **Behind** and **Clear**: Only available for Brush Tool, Pencil Tool
- Some tools have restricted mode sets (see individual tool docs)

### UI Grouping

Modes should be visually grouped with separators matching Photoshop's organization.
