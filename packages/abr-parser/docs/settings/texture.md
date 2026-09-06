# Texture

Texture applies a pattern texture to the brush, affecting how paint is applied.

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `ZTexture`, `ZPattern`, `RoundnessControlType`
> **Descriptor Keys:** See [`src/descriptor-keys.ts`](../../src/descriptor-keys.ts) for `TextureKeys`

**Panel Checkbox:** Can be enabled/disabled for the brush  
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Pattern Selector

- **Type:** Pattern picker dropdown/popup
- **Effect:** Selects the texture pattern to apply
- **ABR Key:** `Ptrn` (Objc: pattern)
- **Note:** Shows current pattern thumbnail

#### Invert

- **Type:** Checkbox (inline with pattern selector)
- **Default:** Unchecked
- **ABR Key:** `invertTexture` (bool)
- **Effect:** Inverts the texture pattern (light ↔ dark)

---

### Scale

- **Type:** Slider with numeric input
- **Range:** 1% - 1000%
- **Default:** 100%
- **ABR Key:** `textureScale` (UntF #Prc)
- **Effect:** Scales the texture pattern size

---

### Brightness

- **Type:** Slider with numeric input
- **Range:** -150 to 150
- **Default:** 0
- **ABR Key:** `textureBrightness` (long)
- **Effect:** Adjusts texture brightness

---

### Contrast

- **Type:** Slider with numeric input
- **Range:** -50 to 100
- **Default:** 0
- **ABR Key:** `textureContrast` (long)
- **Effect:** Adjusts texture contrast

---

### Texture Each Tip

- **Type:** Checkbox
- **Default:** Unchecked
- **ABR Key:** `textureEachTip` (bool)
- **Effect When Checked:** Applies texture to each brush mark individually
- **Effect When Unchecked:** Texture is applied across the entire stroke
- **Enables:** Mode, Depth, Minimum Depth, Depth Jitter controls

---

### Mode

- **Type:** Dropdown
- **Enabled When:** `Texture Each Tip` is checked
- **ABR Key:** `textureBlendMode` (enum)

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

---

### Depth

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 100%
- **ABR Key:** `textureDepth` (UntF #Prc)
- **Enabled When:** `Texture Each Tip` is checked
- **Effect:** How strongly texture affects the brush

---

### Minimum Depth

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `minimumTextureDepth` (UntF #Prc)
- **Enabled When:** `Texture Each Tip` is checked AND `Depth Jitter Control` is NOT `Off`

---

### Depth Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `textureDepthJitter` (UntF #Prc)
- **Enabled When:** `Texture Each Tip` is checked
- **Effect:** Random variation in depth

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation
- **TypeScript:** `RoundnessControlType`
- **ABR Key:** `textureDepthJitterControl` (enum)
- **Default:** Off

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts
export const TextureKeys = {
  useTexture: 'textureEnabled', // bool
  Ptrn: 'pattern', // Objc: pattern
  textureScale: 'scale', // UntF #Prc (1-1000%)
  textureBrightness: 'brightness', // long (-150 to 150)
  textureContrast: 'contrast', // long (-50 to 100)
  textureDepth: 'depth', // UntF #Prc
  textureEachTip: 'textureEachTip', // bool
  textureBlendMode: 'blendMode', // enum
  minimumTextureDepth: 'minimumDepth', // UntF #Prc
  textureDepthJitter: 'depthJitter', // UntF #Prc
  textureDepthJitterControl: 'depthJitterControl', // enum
  invertTexture: 'invert' // bool
};
```

## Pattern Storage in ABR

Patterns ARE stored in ABR files. The parser handles `patt` resource blocks:

```typescript
// From src/types.ts
export const ZPattern = z.object({
  id: z.string(),
  name: z.string(),
  width: ZPixels.min(1),
  height: ZPixels.min(1),
  data: z.instanceof(Uint8Array).optional()
});
```

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

The "Protect Texture" checkbox (in Quick Toggles) ensures the same texture is used across all texture-enabled brushes.
