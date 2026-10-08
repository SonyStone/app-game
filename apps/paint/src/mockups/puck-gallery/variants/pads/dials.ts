import type { Hsv } from '../../../../features/color/hsv';
import { defaultValues, type Setting } from '../../kit/catalog';
import type { LayerId } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers } from '../../kit/pressHandlers';
import { formatValue, fractionOf, roundValue, stepPreset, valueAt, type NumberSetting } from '../../kit/values';

/**
 * A value that an encoder turns: the tool's numbers, the color's hue, saturation and value, a layer's opacity. The
 * keyboard cursor (←/→ to pick, ↑/↓ to turn) addresses the same dials, so every input moves values alike.
 */
export type Dial = {
  /** Stable identity for the keyboard cursor, such as `size` or `hsv:h`. */
  id: string;
  label: string;
  /** Where the value sits on its arc, 0–1. Log settings move geometrically along it. */
  fraction: () => number;
  /** Sets the value at an arc position; drags call it on every move. */
  setFraction: (fraction: number) => void;
  /** Moves by detents (presets), or by the smallest unit when `fine`; for the wheel and the arrow keys. */
  step: (steps: number, fine: boolean) => void;
  /** Back to the default, on a double tap or Backspace; absent when the value has no default. */
  reset?: () => void;
  /** Ends an edit that has a commit, such as a color joining the recent colors. */
  commit?: () => void;
  /** The value as the screen prints it, with its unit. */
  text: () => string;
  /** The arc grows from 12 o'clock both ways, for ranges around zero. */
  bipolar?: boolean;
  /** The value wraps around past its ends instead of stopping (hue). */
  wraps?: boolean;
  /** How many stops a detented dial has (a choice's options); continuous dials leave it out. */
  detents?: number;
};

/** A dial for one of the current tool's numeric settings; resets to the tool's starting value. */
export function settingDial(studio: Studio, setting: NumberSetting): Dial {
  const value = () => studio.number(setting.key);
  const set = (next: number) => studio.setValue(setting.key, next);

  return {
    id: setting.key,
    label: setting.label,
    fraction: () => fractionOf(setting, value()),
    setFraction: (fraction) => set(valueAt(setting, fraction)),
    step(steps, fine) {
      const current = value();
      if (!fine) {
        set(stepPreset(setting, current, steps));
        return;
      }

      if (setting.scale !== 'log') {
        set(roundValue(Math.min(setting.max, Math.max(setting.min, current + steps))));
        return;
      }

      // A fine geometric step may round back to the same value at small sizes; keep going until it changes.
      let fraction = fractionOf(setting, current);
      let next = current;
      for (let attempt = 0; attempt < 40 && next === current && fraction >= 0 && fraction <= 1; attempt++) {
        fraction += steps / 400;
        next = valueAt(setting, fraction);
      }

      set(next);
    },
    reset() {
      const fallback = defaultValues[studio.tool()][setting.key];
      if (typeof fallback === 'number') {
        set(fallback);
      }
    },
    text: () => `${formatValue(value())}${setting.unit}`,
    bipolar: setting.min < 0
  };
}

/**
 * A detented dial for one of the current tool's choices, as Push puts discrete parameters on encoders: each stop is
 * an option, in catalog order, without wrapping; resets to the tool's starting option.
 */
export function choiceDial(studio: Studio, setting: Extract<Setting, { kind: 'choice' }>): Dial {
  const last = setting.options.length - 1;
  const index = () => Math.max(0, setting.options.indexOf(String(studio.value(setting.key))));
  const set = (next: number) => studio.setValue(setting.key, setting.options[Math.min(last, Math.max(0, next))]!);

  return {
    id: setting.key,
    label: setting.label,
    fraction: () => index() / last,
    setFraction: (fraction) => set(Math.round(fraction * last)),
    step: (steps) => set(index() + steps),
    reset() {
      const fallback = defaultValues[studio.tool()][setting.key];
      if (typeof fallback === 'string') {
        studio.setValue(setting.key, fallback);
      }
    },
    text: () => setting.options[index()]!,
    detents: setting.options.length
  };
}

/**
 * The hue, saturation and value dials of the brush color. They edit the color live and commit it (so it joins the
 * recent colors) when a drag ends, or shortly after the last wheel or key step. `hsv` is the color's HSV as the
 * dials last set it (a writable memo of the color): turning the hue of a gray changes no pixel, yet the dial must
 * move and saturation must then start from that hue, so `setHsv` records every edit beside the color itself.
 */
export function colorDials(studio: Studio, hsv: () => Hsv, setHsv: (next: Hsv) => void): readonly Dial[] {
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  const commit = () => {
    clearTimeout(commitTimer);
    studio.commitColor();
  };
  const commitSoon = () => {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 700);
  };
  const set = (change: Partial<Hsv>) => {
    const next = { ...hsv(), ...change };
    setHsv(next);
    studio.setColor(studio.hsvToHex(next));
  };
  const unit = (key: 's' | 'v', label: string): Dial => ({
    id: `hsv:${key}`,
    label,
    fraction: () => hsv()[key],
    setFraction: (fraction) => set({ [key]: fraction }),
    step(steps, fine) {
      const percent = Math.round(hsv()[key] * 100);
      const next = fine ? percent + steps : Math.round((percent + steps * 5) / 5) * 5;
      set({ [key]: Math.min(100, Math.max(0, next)) / 100 });
      commitSoon();
    },
    commit,
    text: () => `${Math.round(hsv()[key] * 100)}%`
  });

  return [
    {
      id: 'hsv:h',
      label: 'Hue',
      fraction: () => hsv().h / 360,
      setFraction: (fraction) => set({ h: (((fraction % 1) + 1) % 1) * 360 }),
      step(steps, fine) {
        const degrees = Math.round(hsv().h);
        const next = fine ? degrees + steps : Math.round((degrees + steps * 15) / 15) * 15;
        set({ h: ((next % 360) + 360) % 360 });
        commitSoon();
      },
      commit,
      text: () => `${Math.round(hsv().h) % 360}°`,
      wraps: true
    },
    unit('s', 'Sat'),
    unit('v', 'Value')
  ];
}

/** A dial for a layer's opacity, 0–100 %, with detents every 5 %; resets to 100 %. */
export function opacityDial(studio: Studio, layer: () => LayerId): Dial {
  const opacity = () => studio.layers().find((entry) => entry.id === layer())?.opacity ?? 0;
  const set = (next: number) => studio.updateLayer(layer(), { opacity: Math.round(Math.min(100, Math.max(0, next))) });

  return {
    id: 'fader',
    label: 'Opacity',
    fraction: () => opacity() / 100,
    setFraction: (fraction) => set(fraction * 100),
    step: (steps, fine) => set(fine ? opacity() + steps : stepPreset(percentSteps, opacity(), steps)),
    reset: () => set(100),
    text: () => `${opacity()}%`
  };
}

const percentSteps: NumberSetting = {
  kind: 'number',
  key: 'opacity',
  label: 'Opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: Array.from({ length: 21 }, (_, index) => index * 5)
};

/**
 * How an encoder answers presses and the wheel, shared by its knob and its screen cell: a press selects it for the
 * keyboard; a vertical drag turns it (up and right increase, DAW style), with Shift ten times finer; a double tap
 * resets it; each wheel notch moves one detent (Shift: fine). Drags keep their own fractional position, so slow
 * moves never stall on rounding. Spread the result on the elements; `dial` may be absent for an unused encoder.
 */
export function dialControl(dial: () => Dial | undefined, select: (dial: Dial) => void) {
  let position = 0;
  let lastTap = -Infinity;
  let wheel = 0;
  const handlers = pressHandlers({
    start() {
      const current = dial();
      if (!current) {
        return false;
      }

      select(current);
      position = current.fraction();
    },
    move(press) {
      const current = dial();
      // The first few pixels are a dead zone, so that a tap never nudges the value.
      if (!current || !press.moved) {
        return;
      }

      const range = current.detents ? current.detents * detentPixels : dragPixels;
      position += (press.delta.x - press.delta.y) / (press.shift ? range * 10 : range);
      position = current.wraps ? position - Math.floor(position) : Math.min(1, Math.max(0, position));
      current.setFraction(position);
    },
    end: () => dial()?.commit?.(),
    tap(_press, event) {
      if (event.timeStamp - lastTap < doubleTapTime) {
        dial()?.reset?.();
        lastTap = -Infinity;
        return;
      }

      lastTap = event.timeStamp;
    },
    cancel: () => dial()?.commit?.()
  });

  return {
    ...handlers,
    onWheel(event: WheelEvent) {
      const current = dial();
      if (!current) {
        return;
      }

      event.preventDefault();
      select(current);
      // Shift turns a mouse wheel into a horizontal one on macOS.
      wheel += event.deltaY || event.deltaX;
      if (Math.abs(wheel) >= wheelNotch) {
        current.step(wheel < 0 ? 1 : -1, event.shiftKey);
        wheel = 0;
      }
    }
  };
}

/** Pixels of drag that sweep an encoder's whole range. */
const dragPixels = 240;
/** Pixels of drag per stop of a detented encoder. */
const detentPixels = 28;
/** Two taps within this many milliseconds are a double tap. */
export const doubleTapTime = 350;
/** Wheel delta that counts as one notch; trackpads add up small deltas. */
export const wheelNotch = 30;
