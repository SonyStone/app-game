# Transfer

Transfer controls how opacity and flow vary during a stroke, often called "paint dynamics" or "ink dynamics."

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `ZTransfer`, `SizeControlType`
> **Descriptor Keys:** See [`src/descriptor-keys.ts`](../../src/descriptor-keys.ts) for `TransferKeys`

**Panel Checkbox:** Can be enabled/disabled for the brush  
**Lock Icon:** Prevents changes when switching brushes

## Settings

### Opacity Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `opacityJitter` (UntF #Prc)
- **Effect:** Random variation in brush opacity

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel
- **TypeScript:** `SizeControlType` (NO Rotation option)
- **ABR Key:** `opacityJitterControl` (enum)
- **Default:** Off

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `minimumOpacity` (UntF #Prc)
- **Enabled When:** Control is NOT `Off`

---

### Flow Jitter

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `flowJitter` (UntF #Prc)
- **Effect:** Random variation in brush flow

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel
- **TypeScript:** `SizeControlType` (NO Rotation option)
- **ABR Key:** `flowJitterControl` (enum)
- **Default:** Off

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `minimumFlow` (UntF #Prc)
- **Enabled When:** Control is NOT `Off`

---

### Wetness Jitter (Mixer Brush Tool Only)

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `wetnessJitter` (UntF #Prc)
- **Availability:** Only enabled for Mixer Brush Tool
- **Effect:** Random variation in wetness

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel
- **ABR Key:** `wetnessJitterControl` (enum)
- **Default:** Off

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **ABR Key:** `minimumWetness` (UntF #Prc)

---

### Mix Jitter (Mixer Brush Tool Only)

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **Default:** 0%
- **ABR Key:** `mixJitter` (UntF #Prc)
- **Availability:** Only enabled for Mixer Brush Tool
- **Effect:** Random variation in mix amount

#### Control

- **Type:** Dropdown
- **Options:** Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel
- **ABR Key:** `mixJitterControl` (enum)
- **Default:** Off

#### Minimum

- **Type:** Slider with numeric input
- **Range:** 0% - 100%
- **ABR Key:** `minimumMix` (UntF #Prc)

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts
export const TransferKeys = {
  usePaintDynamics: 'transferEnabled', // bool
  opacityJitter: 'opacityJitter', // UntF #Prc
  opacityJitterControl: 'opacityJitterControl', // enum
  minimumOpacity: 'minimumOpacity', // UntF #Prc
  flowJitter: 'flowJitter', // UntF #Prc
  flowJitterControl: 'flowJitterControl', // enum
  minimumFlow: 'minimumFlow', // UntF #Prc
  // Mixer Brush only:
  wetnessJitter: 'wetnessJitter', // UntF #Prc
  wetnessJitterControl: 'wetnessJitterControl', // enum
  minimumWetness: 'minimumWetness', // UntF #Prc
  mixJitter: 'mixJitter', // UntF #Prc
  mixJitterControl: 'mixJitterControl', // enum
  minimumMix: 'minimumMix' // UntF #Prc
};
```

## Opacity vs Flow

Understanding the difference:

| Property | Opacity                     | Flow                              |
| -------- | --------------------------- | --------------------------------- |
| Effect   | Overall stroke transparency | Paint "amount" per stamp          |
| Build-up | No build-up within stroke   | Builds up with overlapping stamps |
| Analogy  | Marker transparency         | Airbrush paint amount             |

### Visual Example

```
Opacity = 50%, Flow = 100%:
━━━━━━━━━━━━  (uniform 50% transparency, no build-up)

Opacity = 100%, Flow = 25%:
░░▒▒▓▓██████  (builds up from light to dark with slow painting)
```

## Conditional Logic Summary

```
Tool Type:
├── Brush Tool, Pencil Tool, etc.
│   └── Wetness Jitter: DISABLED
│       Mix Jitter: DISABLED
│
└── Mixer Brush Tool
    └── Wetness Jitter: ENABLED
        Mix Jitter: ENABLED

Opacity/Flow Control:
├── Off → Minimum: DISABLED
└── Any other → Minimum: ENABLED
```

## Implementation Notes

### Build-up Mode

The "Build-up" checkbox (Quick Toggle) affects how Transfer works:

- **Build-up OFF (default):** Stroke opacity caps at Opacity setting
- **Build-up ON:** Opacity can exceed initial setting with continued painting
