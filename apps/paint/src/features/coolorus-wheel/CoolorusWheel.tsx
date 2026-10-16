import type { Point } from '@app-game/paint-core/camera';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { hexToHsv, hsvToHex, type Hsv } from '../color/hsv';
import { hueAt, pointFromSv, svFromPoint, triangleCorners } from '../hue-triangle';
import styles from './CoolorusWheel.module.css';
import { keepLightness, rgbToRybHue, rybToRgbHue } from './coolorusColor';

/**
 * A color wheel after Coolorus, the Photoshop color panel: a hue ring around a triangle of saturation and value, as
 * `HueTriangle`, whose ring can follow the painter's RYB wheel, on which red faces green and yellow faces violet, and
 * whose hue can turn at a locked lightness, so that the new hue is as light as the color was. Drag on the ring to turn
 * the hue, inside to pick saturation and value; the buttons under the wheel switch RYB and the lock. Arrow keys work
 * as in `HueTriangle`. Edits apply live through `onChange`; `onSettle` runs when a drag or keyboard change ends.
 * `settings` are the caller's to keep; `onSettings` receives changes.
 */
export function CoolorusWheel(props: {
  color: string;
  onChange: (color: string) => void;
  onSettle: () => void;
  settings: CoolorusSettings;
  onSettings: (patch: Partial<CoolorusSettings>) => void;
}) {
  // Keeps the written HSV while it still produces `color`, so the hue survives grays and black.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  const ryb = () => props.settings.hues === 'ryb';
  /** Where the hue sits on the ring and where the triangle's hue corner points, in degrees from the top. */
  const angle = createMemo(() => (ryb() ? rgbToRybHue(hsv().h) : hsv().h));
  let canvas!: HTMLCanvasElement;
  let svg!: SVGSVGElement;
  let frame: number | undefined;
  let pending: { angle: number; hue: number } | undefined;
  /** The part being dragged by the captured pointer, and the color the drag started from, for the lightness lock. */
  let drag: { pointer: number; part: 'ring' | 'triangle'; from: string } | undefined;

  // Repaints the triangle at most once per animation frame while the hue changes.
  createEffect(
    () => ({ angle: angle(), hue: hsv().h }),
    (next) => {
      pending = next;
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        paintTriangle(canvas, pending!.angle, pending!.hue);
      });
    }
  );
  onCleanup(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });

  const edit = (next: Hsv) => {
    setHsv(next);
    props.onChange(hsvToHex(next));
  };
  /** Turns the hue to the ring angle `to`; with the lock, at the lightness of `from`. */
  const turn = (to: number, from: string) => {
    const next = { ...hsv(), h: ryb() ? rybToRgbHue(to) : to };
    edit(props.settings.lockLightness ? keepLightness(from, next) : next);
  };
  /** The pointer relative to the center, in units of the view box. */
  const local = (event: PointerEvent): Point => {
    const box = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width - 0.5) * size,
      y: ((event.clientY - box.top) / box.height - 0.5) * size
    };
  };
  const apply = (event: PointerEvent) => {
    const point = local(event);
    if (drag?.part === 'ring') {
      turn(hueAt(point), drag.from);
      return;
    }

    edit({ ...hsv(), ...svFromPoint(point, angle(), triangleRadius) });
  };
  const finish = (event: PointerEvent) => {
    if (drag?.pointer === event.pointerId) {
      drag = undefined;
      props.onSettle();
    }
  };
  const ringMarker = () => {
    const radians = (angle() * Math.PI) / 180;
    const radius = (ringInner + ringOuter) / 2;
    return { x: Math.sin(radians) * radius, y: -Math.cos(radians) * radius };
  };
  const triangleMarker = () => pointFromSv(hsv().s, hsv().v, angle(), triangleRadius);
  const step = (event: KeyboardEvent) => (event.shiftKey ? 10 : 1);

  return (
    <div class={styles.coolorus}>
      <div class={styles.wheel} role="group" aria-label="Coolorus wheel">
        <div class={styles.ring} style={{ background: ryb() ? rybRing : rgbRing }} aria-hidden="true" />
        <canvas ref={canvas} class={styles.canvas} width={pixels} height={pixels} aria-hidden="true" />
        <svg
          ref={svg}
          class={styles.overlay}
          viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
          onPointerDown={(event) => {
            if (drag || (event.pointerType === 'mouse' && event.button !== 0)) {
              return;
            }

            const point = local(event);
            const distance = Math.hypot(point.x, point.y);
            if (distance > ringOuter + 4) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const part = distance >= ringInner - 2 ? 'ring' : 'triangle';
            drag = { pointer: event.pointerId, part, from: props.color };
            apply(event);
          }}
          onPointerMove={(event) => {
            if (drag?.pointer === event.pointerId) {
              apply(event);
            }
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        >
          <circle
            class={styles.marker}
            cx={ringMarker().x}
            cy={ringMarker().y}
            r={(ringOuter - ringInner) / 2 - 1}
            role="slider"
            tabindex="0"
            aria-label={ryb() ? 'Hue on the RYB wheel' : 'Hue'}
            aria-valuemin="0"
            aria-valuemax="359"
            aria-valuenow={Math.round(angle())}
            onKeyDown={(event) => {
              const by = { ArrowLeft: -step(event), ArrowRight: step(event) }[event.key];
              if (by !== undefined) {
                event.preventDefault();
                turn(angle() + by, props.color);
              }
            }}
            onBlur={() => props.onSettle()}
          />
          <circle
            class={styles.marker}
            cx={triangleMarker().x}
            cy={triangleMarker().y}
            r={6}
            role="slider"
            tabindex="0"
            aria-label="Saturation and brightness"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(hsv().v * 100)}
            aria-valuetext={`Saturation ${Math.round(hsv().s * 100)}%, brightness ${Math.round(hsv().v * 100)}%`}
            onKeyDown={(event) => {
              const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1] }[event.key];
              if (delta) {
                event.preventDefault();
                const clamp = (value: number) => Math.min(1, Math.max(0, value));
                edit({
                  ...hsv(),
                  s: clamp(hsv().s + (delta[0]! * step(event)) / 100),
                  v: clamp(hsv().v + (delta[1]! * step(event)) / 100)
                });
              }
            }}
            onBlur={() => props.onSettle()}
          />
        </svg>
      </div>
      <div class={styles.options}>
        <button
          aria-pressed={ryb() ? 'true' : 'false'}
          title="Painter's wheel: red faces green, yellow faces violet"
          onClick={() => props.onSettings({ hues: ryb() ? 'rgb' : 'ryb' })}
        >
          RYB
        </button>
        <button
          aria-pressed={props.settings.lockLightness ? 'true' : 'false'}
          title="Lock lightness: a new hue is as light as the color was"
          onClick={() => props.onSettings({ lockLightness: !props.settings.lockLightness })}
        >
          <SketchIcon name={props.settings.lockLightness ? 'lock' : 'unlock'} size={16} />
          Lightness
        </button>
      </div>
    </div>
  );
}

/**
 * The wheel's options: `hues` lays the ring out as the painter's RYB wheel or as the RGB one; `lockLightness` keeps
 * the perceived lightness when the hue turns (see `keepLightness`).
 */
export type CoolorusSettings = { hues: 'ryb' | 'rgb'; lockLightness: boolean };

/** Coolorus's own start: the painter's wheel, lightness free. */
export const defaultCoolorusSettings: CoolorusSettings = { hues: 'ryb', lockLightness: false };

/** The view box side, in CSS pixels at the component's natural size; the same as `HueTriangle`. */
const size = 220;
const ringOuter = 110;
const ringInner = 88;
/** Center to each corner of the triangle, inside the ring with a small gap. */
const triangleRadius = 84;
/** Backing pixels across the triangle canvas: twice the natural size, enough for dense screens. */
const pixels = size * 2;

/** The ring's colors from the top, clockwise, every 15° of its own hue, for a CSS conic gradient. */
function ringGradient(toRgb: (angle: number) => number) {
  const stops = Array.from({ length: 25 }, (_, index) => hsvToHex({ h: toRgb(index * 15), s: 1, v: 1 }));
  return `conic-gradient(${stops.join(', ')})`;
}

const rybRing = ringGradient(rybToRgbHue);
const rgbRing = ringGradient((angle) => angle % 360);

/**
 * Paints the triangle into the canvas with its hue corner toward `angle` on the ring and the pure color of RGB hue
 * `hue` there: each pixel mixes the hue, white and black by its barycentric weights, in encoded sRGB as HSV defines
 * it; edges are antialiased over one canvas pixel.
 */
function paintTriangle(canvas: HTMLCanvasElement, angle: number, hue: number) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const image = context.createImageData(pixels, pixels);
  const scale = size / pixels;
  const [hr, hg, hb] = [5, 3, 1].map((n) => {
    const k = (n + hue / 60) % 6;
    return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)));
  }) as [number, number, number];
  const { hue: p, white: q, black: r } = triangleCorners(angle, triangleRadius);
  const area = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
  const height = 1.5 * triangleRadius;
  for (let y = 0; y < pixels; y++) {
    const py = (y + 0.5) * scale - size / 2;
    for (let x = 0; x < pixels; x++) {
      const px = (x + 0.5) * scale - size / 2;
      const wa = ((q.x - px) * (r.y - py) - (r.x - px) * (q.y - py)) / area;
      const wb = ((r.x - px) * (p.y - py) - (p.x - px) * (r.y - py)) / area;
      const inside = Math.min(wa, wb, 1 - wa - wb) * height;
      const alpha = Math.min(1, Math.max(0, inside / scale + 0.5));
      if (!alpha) {
        continue;
      }

      const a = Math.max(0, wa),
        b = Math.max(0, wb);
      const index = (y * pixels + x) * 4;
      image.data[index] = a * hr + b * 255;
      image.data[index + 1] = a * hg + b * 255;
      image.data[index + 2] = a * hb + b * 255;
      image.data[index + 3] = alpha * 255;
    }
  }

  context.putImageData(image, 0, 0);
}
