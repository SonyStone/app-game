# @solid-primitives/vibrate

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/vibrate/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitives for triggering and managing device haptic feedback via the [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API).

- [`isVibrationSupported`](vibrate.md#isvibrationsupported) — Check if the Vibration API is available.
- [`makeVibrate`](vibrate.md#makevibrate) — Non-reactive helper; returns `[start, stop]` with no Solid lifecycle dependency.
- [`createVibrate`](vibrate.md#createvibrate) — Reactive primitive; returns `{ vibrating, start, stop, supported }` with automatic cleanup and reactive pattern support.
- [`frequencyToPattern`](vibrate.md#frequencytopattern) — Convert a frequency in Hz to a `[onMs, offMs]` pattern.
- [`makePulse`](vibrate.md#makepulse) — Non-reactive pulse helper; vibrates continuously at a given frequency.
- [`createPulse`](vibrate.md#createpulse) — Reactive pulse primitive; supports reactive `hz` that restarts on change.

## Installation

```bash
npm install @solid-primitives/vibrate
# or
yarn add @solid-primitives/vibrate
# or
pnpm add @solid-primitives/vibrate
```

## `isVibrationSupported`

Returns `true` when the [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) is available. Useful for conditionally rendering haptic UI or showing fallback content.

```ts
import { isVibrationSupported } from "@solid-primitives/vibrate";

if (isVibrationSupported()) {
  console.log("haptics available");
}
```

## `makeVibrate`

A non-reactive building block. Wraps `navigator.vibrate` with an optional repeating interval and returns `[start, stop]`. No Solid lifecycle dependency — both functions are no-ops when the API is unavailable.

```ts
import { makeVibrate } from "@solid-primitives/vibrate";

// Single-shot vibration
const [start, stop] = makeVibrate([200, 100, 200]);
button.addEventListener("click", start);

// Repeating vibration every 2 seconds
const [start, stop] = makeVibrate(100, { interval: 2000 });
start();
// later:
stop();
```

## `createVibrate`

A reactive primitive tied to the current reactive owner. Returns `{ vibrating, start, stop, supported }`. Cleans up automatically on owner disposal.

When `pattern` is a reactive accessor and changes **while vibrating**, vibration restarts with the new pattern automatically.

```ts
import { createVibrate } from "@solid-primitives/vibrate";
import { createEffect } from "solid-js";

const { vibrating, start, stop, supported } = createVibrate([200, 100, 200]);

createEffect(() => {
  console.log("vibrating:", vibrating());
});
```

### Reactive pattern

```ts
import { createVibrate } from "@solid-primitives/vibrate";
import { createSignal } from "solid-js";

const [pattern, setPattern] = createSignal<number | number[]>(200);
const { vibrating, start, stop } = createVibrate(pattern);

start();

// Changing pattern while vibrating restarts automatically
setPattern([100, 30, 100, 30, 100]);
```

### With interval

```ts
const { vibrating, start, stop } = createVibrate(200, { interval: 1000 });
start(); // repeats every second
stop(); // cancels interval + active vibration
```

## `frequencyToPattern`

Converts a frequency in Hz and an optional duty cycle into a single-cycle `[onMs, offMs]` vibration pattern. Useful for previewing what `makePulse` / `createPulse` will produce.

```ts
import { frequencyToPattern } from "@solid-primitives/vibrate";

frequencyToPattern(2); // [250, 250] — 2 Hz, equal on/off
frequencyToPattern(4, 0.25); // ~[63, 188] — 4 Hz, short tap
```

## `makePulse`

Non-reactive pulse helper. Vibrates continuously at `hz` cycles per second. No Solid lifecycle dependency; both functions are no-ops when the API is unavailable.

```ts
import { makePulse } from "@solid-primitives/vibrate";

const [start, stop] = makePulse(4); // 4 taps per second
button.addEventListener("pointerdown", start);
button.addEventListener("pointerup", stop);
```

## `createPulse`

Reactive pulse primitive tied to the current reactive owner. Returns `{ pulsing, start, stop, supported }`. Accepts a reactive `hz` accessor — changing the frequency while pulsing restarts the vibration immediately at the new rhythm.

```ts
import { createPulse } from "@solid-primitives/vibrate";
import { createSignal, createMemo } from "solid-js";

// Fixed frequency
const { pulsing, start, stop } = createPulse(2);

// Reactive frequency — escalates as a countdown nears zero
const [seconds, setSeconds] = createSignal(10);
const hz = createMemo(() => 1 + (10 - seconds()) * 0.5);
const { start, stop } = createPulse(hz);
```

## Types

```ts
export type VibratePattern = number | number[];

export interface VibrateOptions {
  /** Milliseconds between pattern repetitions. Omit to vibrate once per call. */
  interval?: number;
}

export interface PulseOptions {
  /**
   * Fraction of each cycle spent vibrating (0–1). Defaults to `0.5`.
   * A higher value produces longer buzzes; a lower value produces shorter taps.
   */
  dutyCycle?: number;
}
```

## Browser Support

The Vibration API is supported on Chrome/Firefox for Android. It is **not** supported on iOS or most desktop browsers. Always check `isVibrationSupported()` or rely on `supported` from `createVibrate` before enabling haptic features in your UI.

> Note: vibration requires a prior user interaction (sticky activation) and may be suppressed by silent/DND mode.

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/vibrate/CHANGELOG.md)
