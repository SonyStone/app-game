# Control Options

Control options determine how a jitter/dynamic value is modulated by input devices or other factors.

> **TypeScript Reference:** See [`src/types.ts`](../../src/types.ts) for `BaseControlType`, `SizeControlType`, `AngleControlType`, `RoundnessControlType`

## Base Control Options

These options are available for most dynamics controls:

| Control        | Description                                             | Requirements                               |
| -------------- | ------------------------------------------------------- | ------------------------------------------ |
| `Off`          | No dynamic control, uses static jitter value only       | None                                       |
| `Fade`         | Gradually reduces effect over specified number of steps | Shows numeric input for step count         |
| `Dial`         | Modulates based on dial/rotary input device             | Dial hardware (Surface Dial, etc.)         |
| `Pen Pressure` | Modulates based on stylus pressure                      | `PointerEvent.pressure`                    |
| `Pen Tilt`     | Modulates based on stylus tilt angle                    | `PointerEvent.tiltX`, `PointerEvent.tiltY` |
| `Stylus Wheel` | Modulates based on airbrush stylus wheel                | Specialized hardware (Wacom Airbrush)      |

## Extended Control Options

Additional options available for specific dynamics:

### Angle Jitter Control

Includes all Base options plus:

| Control             | Description                                          | Requirements                |
| ------------------- | ---------------------------------------------------- | --------------------------- |
| `Rotation`          | Uses stylus barrel rotation                          | `PointerEvent.twist`        |
| `Initial Direction` | Sets angle based on initial stroke direction         | Track first movement vector |
| `Direction`         | Continuously updates angle based on stroke direction | Track movement vector       |

### Roundness Jitter / Scatter / Count Jitter Control

Includes Base options plus:

| Control    | Description                 | Requirements         |
| ---------- | --------------------------- | -------------------- |
| `Rotation` | Uses stylus barrel rotation | `PointerEvent.twist` |

### Opacity Jitter / Flow Jitter Control

Uses Base options ONLY (no Rotation option).

## Control Option Sets Summary

| Set Name           | TypeScript Type        | Options                                               |
| ------------------ | ---------------------- | ----------------------------------------------------- |
| `SizeControl`      | `SizeControlType`      | Off, Fade, Dial, Pen Pressure, Pen Tilt, Stylus Wheel |
| `AngleControl`     | `AngleControlType`     | SizeControl + Rotation, Initial Direction, Direction  |
| `RoundnessControl` | `RoundnessControlType` | SizeControl + Rotation                                |

**Note:** Size Jitter Control does NOT include Rotation, Initial Direction, or Direction options.

## TypeScript Definition

```typescript
// From src/types.ts

export const BaseControlType = z.enum(['off', 'fade', 'dial', 'penPressure', 'penTilt', 'stylusWheel']);

export const SizeControlType = BaseControlType;

export const RoundnessControlType = z.enum([
  'off',
  'fade',
  'dial',
  'penPressure',
  'penTilt',
  'stylusWheel',
  'rotation'
]);

export const AngleControlType = z.enum([
  'off',
  'fade',
  'dial',
  'penPressure',
  'penTilt',
  'stylusWheel',
  'rotation',
  'initialDirection',
  'direction'
]);
```

## ABR Descriptor Keys

```typescript
// From src/descriptor-keys.ts

export const ControlTypeValues = {
  strokeDynamicsOff: 'off',
  strokeDynamicsFade: 'fade',
  strokeDynamicsDial: 'dial',
  strokeDynamicsPenPressure: 'penPressure',
  strokeDynamicsPenTilt: 'penTilt',
  strokeDynamicsStylusWheel: 'stylusWheel',
  strokeDynamicsRotation: 'rotation',
  strokeDynamicsInitialDirection: 'initialDirection',
  strokeDynamicsDirection: 'direction'
};
```

## Conditional UI Elements

### Fade Control

When `Fade` is selected, show additional input:

- **Steps**: Number input (range: 1-9999, default: 25)
- Label: "steps" or "set the steps for fade"

### Pen Tilt Control

When `Pen Tilt` is selected for **Size Jitter**, enable:

- **Tilt Scale**: Slider (range: 0%-200%, default: 100%)

### Minimum Value Sliders

Most jitter controls have an associated "Minimum" slider that becomes active when Control is NOT `Off`:

- `Minimum Diameter` - for Size Jitter
- `Minimum Roundness` - for Roundness Jitter
- `Minimum Depth` - for Depth Jitter (Texture)
- `Minimum` - for Opacity/Flow Jitter (Transfer)

## PointerEvent Properties Reference

| Property   | Type    | Range     | Description                    |
| ---------- | ------- | --------- | ------------------------------ |
| `pressure` | float   | 0.0 - 1.0 | Pen pressure (0.5 for mouse)   |
| `tiltX`    | integer | -90 to 90 | Tilt angle in X axis (degrees) |
| `tiltY`    | integer | -90 to 90 | Tilt angle in Y axis (degrees) |
| `twist`    | integer | 0 to 359  | Barrel rotation (degrees)      |

### Alternative Tilt Properties (for some devices)

| Property        | Type  | Description                                      |
| --------------- | ----- | ------------------------------------------------ |
| `altitudeAngle` | float | Angle between stylus and surface (radians)       |
| `azimuthAngle`  | float | Angle of stylus rotation around Z axis (radians) |

## Implementation Notes

### Warning Triangle Icon

Photoshop shows a warning triangle (⚠️) next to Control dropdowns when:

- Selected control requires hardware that may not be available
- Example: "Pen Pressure" selected but no pressure-sensitive device detected

### Stylus Wheel Note

The Stylus Wheel control is extremely rare - only available on Wacom Airbrush stylus.

### Dial Note

The Dial control is for rotary input devices like Microsoft Surface Dial. Most users won't have this hardware, but we include it for full ABR file compatibility.
