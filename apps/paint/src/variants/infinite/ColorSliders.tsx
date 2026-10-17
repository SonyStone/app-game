import { For } from 'solid-js';
import { cmykToHex, hexToCmyk, hexToLab, hexToRgb, labToHex, rgbToHex } from '../../features/color/colorModels';
import { hexToHsv, hsvToHex, parseHex, type Hsv } from '../../features/color/hsv';
import styles from './ColorPanel.module.css';
import { createColorCoordinates } from './createColorCoordinates';
import type { InfiniteColorModel } from './createInfiniteColorSettings';
import { Slider } from './Slider';

/**
 * Infinite Painter's Color sliders tab: a model selector (HSB, RGB, LAB, CMYK), the model's sliders, whose tracks
 * show the colors each would make, and the hexadecimal field. Sliders follow a drag through `onEdit` and commit where
 * it lifts or a tap steps them; the hex field takes `#rgb` or `#rrggbb`, with or without `#`, when it is left or
 * Enter is pressed, and goes back to the current color for anything else.
 */
export function ColorSliders(props: {
  color: string;
  /** The HSB coordinates the panel shows for `color`, which keep the hue of grays. */
  hsv: Hsv;
  model: InfiniteColorModel;
  onModel: (model: InfiniteColorModel) => void;
  onEdit: (hsv: Hsv, hex: string) => void;
  onCommit: (color: string) => void;
}) {
  const lab = createColorCoordinates(
    () => props.color,
    (hex) => hexToLab(hex)
  );
  const cmyk = createColorCoordinates(() => props.color, hexToCmyk);
  const models: Record<InfiniteColorModel, ColorModel> = {
    hsb: {
      channels: [
        { label: 'H', min: 0, max: 359, step: 1 },
        { label: 'S', min: 0, max: 100, step: 1 },
        { label: 'B', min: 0, max: 100, step: 1 }
      ],
      values: () => [props.hsv.h, props.hsv.s * 100, props.hsv.v * 100],
      toHex: ([h, s, v]) => hsvToHex({ h: h!, s: s! / 100, v: v! / 100 }),
      hsv: ([h, s, v]) => ({ h: h!, s: s! / 100, v: v! / 100 })
    },
    rgb: {
      channels: [
        { label: 'R', min: 0, max: 255, step: 1 },
        { label: 'G', min: 0, max: 255, step: 1 },
        { label: 'B', min: 0, max: 255, step: 1 }
      ],
      values: () => {
        const { r, g, b } = hexToRgb(props.color);
        return [r, g, b];
      },
      toHex: ([r, g, b]) => rgbToHex({ r: r!, g: g!, b: b! })
    },
    lab: {
      channels: [
        { label: 'L', min: 0, max: 100, step: 1 },
        { label: 'a', min: -128, max: 127, step: 1 },
        { label: 'b', min: -128, max: 127, step: 1 }
      ],
      values: () => {
        const { l, a, b } = lab.coordinates();
        return [l, a, b];
      },
      toHex: ([l, a, b]) => labToHex({ l: l!, a: a!, b: b! }),
      show: ([l, a, b], hex) => lab.show({ l: l!, a: a!, b: b! }, hex)
    },
    cmyk: {
      channels: [
        { label: 'C', min: 0, max: 100, step: 1 },
        { label: 'M', min: 0, max: 100, step: 1 },
        { label: 'Y', min: 0, max: 100, step: 1 },
        { label: 'K', min: 0, max: 100, step: 1 }
      ],
      values: () => {
        const { c, m, y, k } = cmyk.coordinates();
        return [c * 100, m * 100, y * 100, k * 100];
      },
      toHex: ([c, m, y, k]) => cmykToHex({ c: c! / 100, m: m! / 100, y: y! / 100, k: k! / 100 }),
      show: ([c, m, y, k], hex) => cmyk.show({ c: c! / 100, m: m! / 100, y: y! / 100, k: k! / 100 }, hex)
    }
  };
  const model = () => models[props.model];
  /** Sets channel `index` to `value`, passing the new color on; returns it. */
  const edit = (index: number, value: number) => {
    const values = model()
      .values()
      .map((current, at) => (at === index ? value : current));
    const hex = model().toHex(values);
    model().show?.(values, hex);
    props.onEdit(model().hsv?.(values) ?? hexToHsv(hex, props.hsv), hex);
    return hex;
  };
  /** The track of channel `index`: the colors it makes across its range, the other channels kept. */
  const track = (index: number) => {
    const { min, max } = model().channels[index]!;
    const values = model().values();
    const stops = Array.from({ length: trackStops }, (_, stop) => {
      const value = min + ((max - min) * stop) / (trackStops - 1);
      return model().toHex(values.map((current, at) => (at === index ? value : current)));
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
  };
  const enterHex = (input: HTMLInputElement) => {
    const hex = parseHex(input.value);
    if (!hex) {
      input.value = props.color.slice(1).toUpperCase();
      return;
    }

    props.onEdit(hexToHsv(hex, props.hsv), hex);
    props.onCommit(hex);
  };

  return (
    <div class={styles.sliders}>
      <div class={styles.models} role="radiogroup" aria-label="Color model">
        <For each={modelNames}>
          {(entry) => (
            <button
              role="radio"
              aria-checked={props.model === entry.id ? 'true' : 'false'}
              onClick={() => props.onModel(entry.id)}
            >
              {entry.label}
            </button>
          )}
        </For>
      </div>
      <div class={styles.sliderBox}>
        <For each={model().channels}>
          {(channel, index) => (
            <Slider
              label={channel.label}
              min={channel.min}
              max={channel.max}
              step={channel.step}
              value={model().values()[index()]!}
              background={track(index())}
              onInput={(value) => edit(index(), value)}
              onChange={(value) => props.onCommit(edit(index(), value))}
            />
          )}
        </For>
      </div>
      <label class={styles.hexRow}>
        <span>Hexadecimal</span>
        <span class={styles.hexField}>
          #
          <input
            value={props.color.slice(1).toUpperCase()}
            maxlength={7}
            spellcheck={false}
            autocomplete="off"
            aria-label="Hexadecimal color"
            onChange={(event) => enterHex(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </span>
      </label>
    </div>
  );
}

/** A slider model: its channels, their values for the current color and the color that values make. */
type ColorModel = {
  channels: { label: string; min: number; max: number; step: number }[];
  values: () => number[];
  toHex: (values: number[]) => string;
  /** HSB coordinates for `values` when the model has them itself; otherwise read from the color. */
  hsv?: (values: number[]) => Hsv;
  /** Keeps `values` shown for `hex`, for models that the color does not determine. */
  show?: (values: number[], hex: string) => void;
};

const modelNames: { id: InfiniteColorModel; label: string }[] = [
  { id: 'hsb', label: 'HSB' },
  { id: 'rgb', label: 'RGB' },
  { id: 'lab', label: 'LAB' },
  { id: 'cmyk', label: 'CMYK' }
];

/** Colors computed along each slider's track. */
const trackStops = 9;
