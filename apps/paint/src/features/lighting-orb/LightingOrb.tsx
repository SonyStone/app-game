import { createEffect, For } from 'solid-js';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import styles from './LightingOrb.module.css';
import { createOrbShader, orbColor, type OrbLights } from './shading';

/**
 * The Lighting Orb: a sphere shaded from the `lights` (see {@link OrbLights}) to pick colors of an object in light and
 * shadow, and under it the shadow, base and light color chips. A press on the orb moves the picker there and drags
 * it: `onPicker` receives the picker's new place, `onInput` the color under it while the press lasts and `onCommit`
 * the color where it lifts. Changing the lights does not pick: the picker shows the orb's color under it, which may
 * differ from the caller's current color until the next pick.
 *
 * A tap on a chip calls `onSelect`; the selected chip is drawn larger, and the caller's sliders edit its color.
 */
export function LightingOrb(props: {
  lights: OrbLights;
  /** Where the picker is on the orb's disc: the unit circle, `y` pointing down. */
  picker: OrbPoint;
  selected: OrbChip;
  onSelect: (chip: OrbChip) => void;
  onPicker: (point: OrbPoint) => void;
  onInput: (color: string) => void;
  onCommit: (color: string) => void;
  /** The orb's diameter in CSS pixels; 200 by default. */
  size?: number;
}) {
  let canvas!: HTMLCanvasElement;
  /** The color the press in progress last picked, committed when it lifts. */
  let picked = '';
  const size = () => props.size ?? 200;

  createEffect(
    () => ({ ...props.lights, size: size() }),
    (lights) => paintOrb(canvas, lights, Math.round(lights.size * Math.min(2, globalThis.devicePixelRatio || 1)))
  );

  /** The press's place on the orb's disc, moved onto the rim when it is off the disc. */
  const pointOf = (press: Press): OrbPoint => {
    const rect = press.target.getBoundingClientRect();
    const x = ((press.point.x - rect.left) / rect.width) * 2 - 1;
    const y = ((press.point.y - rect.top) / rect.height) * 2 - 1;
    const reach = Math.hypot(x, y);
    return reach > 1 ? { x: x / reach, y: y / reach } : { x, y };
  };
  const pick = (press: Press) => {
    const point = pointOf(press);
    picked = orbColor(props.lights, point.x, point.y);
    props.onPicker(point);
    props.onInput(picked);
  };
  // Created once: a spread of a call would be re-evaluated, and lose the press, when another attribute changes.
  const press = pressHandlers({
    start: pick,
    move: pick,
    end: () => props.onCommit(picked)
  });

  return (
    <div class={styles.orbPicker}>
      <div
        class={styles.orb}
        role="group"
        aria-label="Lighting Orb: drag to pick a color"
        style={{ width: `${size()}px`, height: `${size()}px` }}
        {...press}
      >
        <canvas ref={canvas} class={styles.canvas} />
        <span
          class={styles.picker}
          style={{
            left: `${50 + props.picker.x * 50}%`,
            top: `${50 + props.picker.y * 50}%`,
            background: orbColor(props.lights, props.picker.x, props.picker.y)
          }}
        />
      </div>
      <div class={styles.chips}>
        <For each={chips}>
          {(chip) => (
            <span class={styles.chipGroup}>
              <svg
                class={styles.chipIcon}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d={chip.icon} />
              </svg>
              <button
                class={styles.chip}
                style={{ background: props.lights[chip.id] }}
                aria-pressed={props.selected === chip.id ? 'true' : 'false'}
                aria-label={chip.label}
                title={chip.label}
                onClick={() => props.onSelect(chip.id)}
              />
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

/** A place on the orb's disc: the unit circle, `y` pointing down. */
export type OrbPoint = { x: number; y: number };

/** The orb's colors that its chips show and select. */
export type OrbChip = 'shadow' | 'base' | 'light';

const chips: { id: OrbChip; label: string; icon: string }[] = [
  { id: 'shadow', label: 'Shadow color', icon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z' },
  { id: 'base', label: 'Base color', icon: 'M12 4s-5.5 6-5.5 10a5.5 5.5 0 0 0 11 0C17.5 10 12 4 12 4Z' },
  {
    id: 'light',
    label: 'Light color',
    icon: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4'
  }
];

/** Shades the orb into `canvas` at `pixels` × `pixels`, its edge antialiased; does nothing without a 2D context. */
function paintOrb(canvas: HTMLCanvasElement, lights: OrbLights, pixels: number) {
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const shade = createOrbShader(lights);
  const image = context.createImageData(pixels, pixels);
  const radius = pixels / 2;
  for (let row = 0; row < pixels; row++) {
    for (let column = 0; column < pixels; column++) {
      const x = (column + 0.5 - radius) / radius;
      const y = (row + 0.5 - radius) / radius;
      const coverage = Math.min(1, Math.max(0, (1 - Math.hypot(x, y)) * radius + 0.5));
      if (coverage <= 0) {
        continue;
      }

      const [r, g, b] = shade(x, y);
      const offset = (row * pixels + column) * 4;
      image.data[offset] = r * 255;
      image.data[offset + 1] = g * 255;
      image.data[offset + 2] = b * 255;
      image.data[offset + 3] = coverage * 255;
    }
  }

  context.putImageData(image, 0, 0);
}
