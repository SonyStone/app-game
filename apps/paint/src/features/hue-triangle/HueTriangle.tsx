import type { Point } from '@app-game/paint-core/camera';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../color/hsv';
import styles from './HueTriangle.module.css';
import { hueAt, pointFromSv, svFromPoint, triangleCorners } from './triangleGeometry';

/**
 * The classic color wheel: a hue ring around a triangle of saturation and value whose corners are the pure hue, white
 * and black; the triangle turns so its hue corner points at the hue (see `triangleCorners`). Drag on the ring to turn
 * the hue, inside to pick saturation and value. Arrow keys: left and right turn the hue on the ring; on the triangle
 * they change saturation, up and down the value. Edits apply live through `onChange`; `onSettle` runs when a drag or
 * keyboard change ends.
 */
export function HueTriangle(props: { color: string; onChange: (color: string) => void; onSettle: () => void }) {
  // Keeps the written HSV while it still produces `color`, so the hue survives grays and black.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  const hue = createMemo(() => hsv().h);
  let canvas!: HTMLCanvasElement;
  let svg!: SVGSVGElement;
  let frame: number | undefined;
  let pending: number | undefined;
  /** The part being dragged by the captured pointer. */
  let drag: { pointer: number; part: 'ring' | 'triangle' } | undefined;

  // Repaints the triangle at most once per animation frame while the hue changes.
  createEffect(hue, (h) => {
    pending = h;
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      paintTriangle(canvas, pending!);
    });
  });
  onCleanup(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });

  const edit = (next: Hsv) => {
    setHsv(next);
    props.onChange(hsvToHex(next));
  };
  /** The pointer relative to the center, in units of the view box. */
  const local = (event: PointerEvent): Point => {
    const box = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width - 0.5) * size,
      y: ((event.clientY - box.top) / box.height - 0.5) * size
    };
  };
  const apply = (event: PointerEvent, part: 'ring' | 'triangle') => {
    const point = local(event);
    if (part === 'ring') {
      edit({ ...hsv(), h: hueAt(point) });
      return;
    }

    edit({ ...hsv(), ...svFromPoint(point, hsv().h, triangleRadius) });
  };
  const finish = (event: PointerEvent) => {
    if (drag?.pointer === event.pointerId) {
      drag = undefined;
      props.onSettle();
    }
  };
  const ringMarker = () => {
    const angle = (hsv().h * Math.PI) / 180;
    const radius = (ringInner + ringOuter) / 2;
    return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
  };
  const triangleMarker = () => pointFromSv(hsv().s, hsv().v, hsv().h, triangleRadius);
  const step = (event: KeyboardEvent) => (event.shiftKey ? 10 : 1);

  return (
    <div class={styles.triangle} role="group" aria-label="Hue triangle">
      <div class={styles.ring} aria-hidden="true" />
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
          const part = distance >= ringInner - 2 ? 'ring' : 'triangle';
          if (distance > ringOuter + 4) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag = { pointer: event.pointerId, part };
          apply(event, part);
        }}
        onPointerMove={(event) => {
          if (drag?.pointer === event.pointerId) {
            apply(event, drag.part);
          }
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      >
        <circle
          class={styles.ringMarker}
          cx={ringMarker().x}
          cy={ringMarker().y}
          r={(ringOuter - ringInner) / 2 - 1}
          role="slider"
          tabindex="0"
          aria-label="Hue"
          aria-valuemin="0"
          aria-valuemax="359"
          aria-valuenow={Math.round(hsv().h)}
          onKeyDown={(event) => {
            const turn = { ArrowLeft: -step(event), ArrowRight: step(event) }[event.key];
            if (turn !== undefined) {
              event.preventDefault();
              edit({ ...hsv(), h: (hsv().h + turn + 360) % 360 });
            }
          }}
          onBlur={() => props.onSettle()}
        />
        <circle
          class={styles.triangleMarker}
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
  );
}

/** The view box side, in CSS pixels at the component's natural size. */
const size = 220;
const ringOuter = 110;
const ringInner = 88;
/** Center to each corner of the triangle, inside the ring with a small gap. */
const triangleRadius = 84;
/** Backing pixels across the triangle canvas: twice the natural size, enough for dense screens. */
const pixels = size * 2;

/**
 * Paints the triangle for `hue` into the canvas: each pixel mixes the hue, white and black by its barycentric weights,
 * in encoded sRGB as the HSV values define it; edges are antialiased over one canvas pixel.
 */
function paintTriangle(canvas: HTMLCanvasElement, hue: number) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const image = context.createImageData(pixels, pixels);
  const scale = size / pixels;
  // The pure hue's red, green and blue, as `hsvToHex` computes them at full saturation and value.
  const [hr, hg, hb] = [5, 3, 1].map((n) => {
    const k = (n + hue / 60) % 6;
    return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)));
  }) as [number, number, number];
  // Barycentric weights, as `triangleWeights` computes them, times the triangle's height are distances to the edges.
  const { hue: p, white: q, black: r } = triangleCorners(hue, triangleRadius);
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
