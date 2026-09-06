# Texture

Texture applies a pattern texture to the brush, affecting how paint is applied.

**Panel Checkbox:** Can be enabled/disabled for the brush
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Pattern Selector

- **Type:** Pattern picker dropdown/popup
- **Effect:** Selects the texture pattern to apply
- **Note:** Shows current pattern thumbnail

#### Pattern Organization

Patterns are organized in groups (folders):

- Groups can be collapsed/expanded
- Patterns can be nested within groups (e.g., Trees, Grass, Water)
- Each pattern shows thumbnail and name

#### Pattern Panel Menu (⚙️)

| Option                        | Description                       |
| ----------------------------- | --------------------------------- |
| `New Pattern...`              | Create new pattern from selection |
| `Rename Pattern...`           | Rename selected pattern           |
| `Delete Pattern...`           | Delete selected pattern           |
| ---                           | ---                               |
| `Text Only`                   | View: names only                  |
| `Small Thumbnail`             | View: small thumbnails            |
| `Large Thumbnail`             | View: large thumbnails            |
| `Small List`                  | View: small thumbnails + names    |
| `Large List`                  | View: large thumbnails + names    |
| ---                           | ---                               |
| `Append Default Patterns...`  | Add Photoshop's default patterns  |
| `Import Patterns...`          | Import patterns from .pat file    |
| `Export Selected Patterns...` | Export patterns to .pat file      |

#### Invert

- **Type:** Checkbox (inline with pattern selector)
- **Default:** Unchecked
- **Effect:** Inverts the texture pattern (light ↔ dark)

#### Add Pattern Button (+)

- **Type:** Button
- **Effect:** Opens dialog to add/import new patterns

---

### Scale

- **Type:** Slider with numeric input
- **Range:** 1% - 1000%
- **Default:** 100%
- **Effect:** Scales the texture pattern size

---

### Brightness

- **Type:** Slider with numeric input
- **Range:** -150 to 150
- **Default:** 0
- **Effect:** Adjusts texture brightness

---

### Contrast

- **Type:** Slider with numeric input
- **Range:** -50 to 100
- **Default:** 0
- **Effect:** Adjusts texture contrast

---

### Texture Each Tip

- **Type:** Checkbox
- **Default:** Unchecked
- **Effect When Checked:** Applies texture to each brush mark individually
- **Effect When Unchecked:** Texture is applied across the entire stroke
- **Enables:** Mode, Depth, Minimum Depth, Depth Jitter controls

---

### Mode

- **Type:** Dropdown
- **Enabled When:** `Texture Each Tip` is checked
- **Options:**

| Mode            | Description                        |
| --------------- | ---------------------------------- |
| `Multiply`      | Darkens based on texture (default) |
| `Subtract`      | Subtracts texture from brush       |
| `Darken`        | Uses darker of brush or texture    |
| `Overlay`       | Combines multiply/screen           |
| `Color Dodge`   | Brightens based on texture         |
| `Color Burn`    | Darkens based on texture           |
| `Linear Burn`   | Linear darkening                   |
| `Hard Mix`      | High contrast result               |
| `Linear Height` | Uses texture as linear height map  |
| `Height`        | Uses texture as height map         |

- **Default:** Multiply

---

### Depth

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 100%
- **Enabled When:** `Texture Each Tip` is checked
- **Effect:** How strongly texture affects the brush

---

### Minimum Depth

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Enabled When:** `Texture Each Tip` is checked AND `Depth Jitter Control` is NOT `Off`
- **Effect:** Minimum depth when using dynamic control

---

### Depth Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **Enabled When:** `Texture Each Tip` is checked
- **Effect:** Random variation in depth

#### Control

- **Type:** Dropdown
- **Options:** [Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation]
- **Default:** Off
- **Enabled When:** `Texture Each Tip` is checked
- **See:** [Control Options](./Control-Options.md#roundness-jitter-control)

## Conditional Logic Summary

```
Texture Each Tip:
├── Unchecked → Mode: DISABLED
│              Depth: DISABLED
│              Minimum Depth: DISABLED
│              Depth Jitter: DISABLED
│              Depth Control: DISABLED
│
└── Checked → Mode: ENABLED
              Depth: ENABLED
              Depth Jitter: ENABLED
              Depth Control: ENABLED
              │
              └── Depth Control:
                  ├── Off → Minimum Depth: DISABLED
                  └── Any other → Minimum Depth: ENABLED
```

## Implementation Notes

### Pattern Storage

**✅ Patterns ARE stored in ABR files!**

The existing parser already handles patterns:

- Parser reads `patt` resource blocks from ABR files
- Pattern structure: `{ id, name, width, height, data }`
- Raw pattern data is preserved for round-trip (`rawPatternData`)

**Pattern Properties (from types.ts):**

```typescript
{
  id: string,      // Unique pattern ID
  name: string,    // Display name
  width: number,   // Pattern width in pixels
  height: number,  // Pattern height in pixels
  data?: Uint8Array // Pattern image data
}
```

### Pattern Panel Features to Implement

Based on Photoshop UI:

- [ ] Display patterns in groups (Trees, Grass, Water, etc.)
- [ ] Pattern view modes (Text Only, Small/Large Thumbnail, Small/Large List)
- [ ] New Pattern... (create from selection - may not apply to brush editor)
- [ ] Rename Pattern...
- [ ] Delete Pattern...
- [ ] Import Patterns... (from .pat files)
- [ ] Export Selected Patterns... (to .pat files)
- [ ] Append Default Patterns...

### Texture Application

When `Texture Each Tip` is unchecked:

- Texture acts as a fixed overlay on the canvas
- Brush "reveals" the texture as it paints
- Texture position is absolute to canvas, not stroke

When `Texture Each Tip` is checked:

- Each brush stamp has texture applied individually
- Creates more varied, organic results
- More computationally expensive

### Protect Texture

The "Protect Texture" checkbox (in main brush settings list) ensures the same texture is used across all texture-enabled brushes, useful for consistent material rendering.
