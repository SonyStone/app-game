import { createSignal, For, Show } from 'solid-js';
import { ColorPickerLoupe, type PickerPreview } from '../../features/color';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { paletteHeight, paletteWidth, type MixingPalette as Palette } from './createMixingPalette';
import styles from './MixingPalette.module.css';
import { dab, dragKnife, pressKnife, sampleColor, wipe, type Knife } from './paletteSurface';
import { hexToRgb, rgbToHex, type Rgb } from './pigment';

/**
 * The mixing palette panel: a column of paint tubes beside the palette, and its tools. Paint goes on from the tubes
 * (tap a tube, then the palette; or drag from a tube onto it), mixes under the knife, and loads the brush where the
 * pen touches it, previewed in a loupe while the pen is down.
 *
 * - Pen or mouse: with **Load** chosen, press to preview the color under the tip and lift to load the brush with it;
 *   with **Knife** chosen, drag to smear and mix. The pen's eraser end wipes paint off.
 * - Finger: a tap loads the brush, a drag mixes, whatever tool is chosen.
 * - A tapped tube lays its paint with the next press, which may drag a ribbon of it; then the tool returns.
 *
 * The brush-color chip under the tubes lays the brush's current color, such as one picked from the drawing, so it
 * can be mixed too. **Clean** wipes the palette; until new paint goes on, it can be restored.
 */
export function MixingPalette(props: {
  palette: Palette;
  /** The brush's color, beside the sample in the loupe and on the brush-color chip. */
  color: string;
  /** Loads the brush with `color`, picked from the palette. */
  onLoad: (color: string) => void;
}) {
  const { palette } = props;
  const { surface } = palette;
  const [tool, setTool] = createSignal<'load' | 'knife'>('load');
  /** The paint the next press lays: a tube's color, or the brush's. */
  const [armed, setArmed] = createSignal<{ name: string; color: string }>();
  const [preview, setPreview] = createSignal<PickerPreview>();
  let canvas!: HTMLCanvasElement;
  /** The press on the palette in progress. */
  let press:
    | {
        id: number;
        kind: 'load' | 'knife' | 'paint' | 'wipe' | 'touch';
        start: { x: number; y: number };
        last: { x: number; y: number };
        color?: Rgb;
        knife?: Knife;
      }
    | undefined;

  /** Palette pixels per CSS pixel of the shown palette. */
  const scale = () => paletteWidth / Math.max(1, canvas.getBoundingClientRect().width);
  const toPalette = (event: { clientX: number; clientY: number }) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * paletteWidth) / rect.width,
      y: ((event.clientY - rect.top) * paletteHeight) / rect.height
    };
  };
  /** Lays paint or wipes from `from` to `to`, a dab every third of a radius. */
  const stroke = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    kind: 'paint' | 'wipe',
    color?: Rgb
  ) => {
    const radius = (kind === 'paint' ? paintRadius : wipeRadius) * scale();
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (radius / 3)));
    for (let step = 1; step <= steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps,
        y = from.y + ((to.y - from.y) * step) / steps;
      palette.changed(kind === 'paint' ? dab(surface, x, y, radius, color!) : wipe(surface, x, y, radius));
    }
  };
  const showPick = (event: PointerEvent) => {
    const point = toPalette(event);
    const sample = sampleColor(surface, point.x, point.y, sampleRadius);
    setPreview({
      point: { x: event.clientX, y: event.clientY },
      color: sample ? rgbToHex(sample) : null,
      current: props.color,
      size: 3,
      loupeSide: loupeSide,
      loupe: magnified(point)
    });
  };
  const loadAt = (event: { clientX: number; clientY: number }) => {
    const point = toPalette(event);
    const sample = sampleColor(surface, point.x, point.y, sampleRadius);
    if (sample) {
      props.onLoad(rgbToHex(sample));
    }
  };
  /** A drag from a tube moved from `from` to `to`, client CSS pixels: lays `color` where it is over the palette. */
  const ribbon = (from: { x: number; y: number }, to: { x: number; y: number }, color: string) => {
    const rect = canvas.getBoundingClientRect();
    if (!inside(rect, to)) {
      return;
    }

    const start = inside(rect, from) ? from : to;
    stroke(
      toPalette({ clientX: start.x, clientY: start.y }),
      toPalette({ clientX: to.x, clientY: to.y }),
      'paint',
      hexToRgb(color)
    );
  };
  const startKnife = (at: { x: number; y: number }) => pressKnife(surface, at.x, at.y, knifeRadius * scale());
  // Hoisted: an inline spread would be re-created when another attribute of the canvas changes.
  const surfaceHandlers = {
    onPointerDown(event: PointerEvent) {
      if (press || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }

      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const point = toPalette(event);
      const eraser = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0);
      const paint = armed();
      press = { id: event.pointerId, kind: 'load', start: point, last: point };
      if (eraser) {
        press.kind = 'wipe';
        stroke(point, point, 'wipe');
      } else if (paint) {
        press.kind = 'paint';
        // The brush-color chip lays the brush's color at the time of the press.
        press.color = hexToRgb(paint.name === brushColorName ? props.color : paint.color);
        stroke(point, point, 'paint', press.color);
      } else if (event.pointerType === 'touch') {
        press.kind = 'touch';
      } else if (tool() === 'knife') {
        press.kind = 'knife';
        press.knife = startKnife(point);
      } else {
        showPick(event);
      }
    },
    onPointerMove(event: PointerEvent) {
      if (press?.id !== event.pointerId) {
        return;
      }

      const current = press;
      const events = event.getCoalescedEvents?.() ?? [];
      for (const each of events.length > 0 ? events : [event]) {
        const point = toPalette(each);
        if (
          current.kind === 'touch' &&
          Math.hypot(point.x - current.start.x, point.y - current.start.y) / scale() > touchDragDistance
        ) {
          current.kind = 'knife';
          current.knife = startKnife(current.start);
        }

        if (current.kind === 'paint' || current.kind === 'wipe') {
          stroke(current.last, point, current.kind, current.color);
        } else if (current.kind === 'knife') {
          palette.changed(dragKnife(surface, current.knife!, point.x, point.y));
        }

        current.last = point;
      }

      if (current.kind === 'load') {
        showPick(event);
      }
    },
    onPointerUp(event: PointerEvent) {
      if (press?.id !== event.pointerId) {
        return;
      }

      const ended = press;
      press = undefined;
      setPreview(undefined);
      if (ended.kind === 'load' || ended.kind === 'touch') {
        loadAt(event);
      }

      if (ended.kind === 'paint') {
        setArmed(undefined);
      }
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel
  };

  return (
    <div class={styles.palette}>
      <div class={styles.tools} role="toolbar" aria-label="Palette tools">
        <button
          class={styles.tool}
          aria-pressed={tool() === 'load' && !armed() ? 'true' : 'false'}
          title="Load: touch paint with the pen to load the brush"
          onClick={() => {
            setArmed(undefined);
            setTool('load');
          }}
        >
          <SketchIcon name="picker" size={18} />
          <span>Load</span>
        </button>
        <button
          class={styles.tool}
          aria-pressed={tool() === 'knife' && !armed() ? 'true' : 'false'}
          title="Knife: drag to smear and mix paint"
          onClick={() => {
            setArmed(undefined);
            setTool('knife');
          }}
        >
          <KnifeIcon />
          <span>Knife</span>
        </button>
        <button
          class={styles.tool}
          title="Clean: wipe the palette"
          disabled={palette.blank()}
          onClick={() => {
            setArmed(undefined);
            palette.clean();
          }}
        >
          <SketchIcon name="trash" size={18} />
          <span>Clean</span>
        </button>
      </div>
      <div class={styles.body}>
        <div class={styles.tubes} role="group" aria-label="Paint tubes">
          <For each={tubes}>
            {(tube) => (
              <Tube
                name={tube.name}
                color={tube.color}
                armed={armed()?.name === tube.name}
                onArm={() => setArmed(armed()?.name === tube.name ? undefined : tube)}
                onDrag={(from, to) => ribbon(from, to, tube.color)}
              />
            )}
          </For>
          <Tube
            name={brushColorName}
            color={props.color}
            brush
            armed={armed()?.name === brushColorName}
            onArm={() =>
              setArmed(armed()?.name === brushColorName ? undefined : { name: brushColorName, color: props.color })
            }
            onDrag={(from, to) => ribbon(from, to, props.color)}
          />
        </div>
        <div class={styles.surfaceBox}>
          <canvas
            ref={(element) => {
              canvas = element;
              palette.setCanvas(element);
            }}
            class={styles.surface}
            width={paletteWidth}
            height={paletteHeight}
            aria-label="Mixing palette"
            data-mode={armed() ? 'paint' : tool()}
            {...surfaceHandlers}
          />
          <Show when={palette.blank()}>
            <div class={styles.empty}>
              <p>Tap a tube, then the palette.</p>
              <Show when={palette.canRestore()}>
                <button class={styles.restore} onClick={() => palette.restore()}>
                  Restore paint
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </div>
      <p class={styles.status} role="status">
        <Show
          when={armed()}
          fallback={
            tool() === 'knife'
              ? 'Drag to mix · finger tap loads the brush'
              : 'Pen: touch paint to load · finger drag mixes'
          }
        >
          {(paint) => `${paint().name}: tap or drag on the palette`}
        </Show>
      </p>
      <Show when={preview()}>
        {(current) => (
          <div class={styles.loupeLayer}>
            <ColorPickerLoupe preview={current()} />
          </div>
        )}
      </Show>
    </div>
  );

  function cancel(event: PointerEvent) {
    if (press?.id === event.pointerId) {
      press = undefined;
      setPreview(undefined);
    }
  }

  /** The palette's pixels around `point` over its bare color, for the loupe. */
  function magnified(point: { x: number; y: number }) {
    const side = Math.round(loupeSide * scale()) | 1;
    const pixels = new Uint8ClampedArray(side * side * 4);
    const left = Math.round(point.x) - (side >> 1),
      top = Math.round(point.y) - (side >> 1);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const px = left + x,
          py = top + y;
        const to = (y * side + x) * 4;
        const outside = px < 0 || py < 0 || px >= surface.width || py >= surface.height;
        const from = (py * surface.width + px) * 4;
        const alpha = outside ? 0 : surface.data[from + 3]! / 255;
        for (let channel = 0; channel < 3; channel++) {
          const paint = outside ? 0 : surface.data[from + channel]!;
          pixels[to + channel] = paint * alpha + bare[channel]! * (1 - alpha);
        }

        pixels[to + 3] = 255;
      }
    }

    return { side, pixels };
  }
}

/**
 * The paints on the tubes: white, black and six hues chosen to mix well, after common artists' oils. Blue and yellow
 * give green, red and yellow orange, magenta and blue violet; burnt sienna gives earth and skin tones.
 */
export const tubes: readonly { name: string; color: string }[] = [
  { name: 'Titanium white', color: '#f7f7f5' },
  { name: 'Ivory black', color: '#1e1d1c' },
  { name: 'Cadmium yellow', color: '#ffd21a' },
  { name: 'Cadmium red', color: '#d42a1e' },
  { name: 'Quinacridone magenta', color: '#c4237a' },
  { name: 'Ultramarine blue', color: '#1846c4' },
  { name: 'Phthalo blue', color: '#0b6ea8' },
  { name: 'Burnt sienna', color: '#7b3f22' }
];

/**
 * A paint tube: tap to lay its paint with the next press on the palette, tap again to put it back; or drag from it
 * onto the palette to lay a ribbon of paint right away.
 */
function Tube(props: {
  name: string;
  color: string;
  /** The brush-color chip, marked as such. */
  brush?: boolean;
  armed: boolean;
  onArm: () => void;
  /** A drag from the tube moved from `from` to `to`, client CSS pixels. */
  onDrag: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
}) {
  let last: { x: number; y: number } | undefined;
  const handlers = pressHandlers({
    start(press) {
      last = press.point;
    },
    move(press) {
      if (press.moved) {
        props.onDrag(last ?? press.point, press.point);
        last = press.point;
      }
    },
    tap: () => props.onArm(),
    end() {
      last = undefined;
    }
  });

  return (
    <div
      class={styles.tube}
      role="button"
      aria-pressed={props.armed ? 'true' : 'false'}
      aria-label={props.name}
      title={`${props.name}: tap, then the palette; or drag onto it`}
      data-brush={props.brush ? 'true' : undefined}
      {...handlers}
    >
      <span style={{ background: props.color }} />
    </div>
  );
}

/** A palette knife: a handle and a bent, rounded blade. */
function KnifeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 21l5-5M8 16l2.5-2.5M10.5 13.5 19 5c1.5-1.5 2.5-.5 1.5 1L12 15Z" />
    </svg>
  );
}

const brushColorName = 'Brush color';

/** The bare palette's color under paint, for the loupe; keep it in step with the stylesheet. */
const bare: Rgb = [236, 236, 234];

/** CSS pixels: the radius of laid paint, of the eraser end's wipe and of the knife's blade. */
const paintRadius = 11;
const wipeRadius = 14;
const knifeRadius = 13;

/** Palette pixels around the pen averaged by a load. */
const sampleRadius = 3;

/** CSS pixels per side of the palette magnified in the loupe. */
const loupeSide = 11;

/** CSS pixels a finger moves before its press mixes instead of loading. */
const touchDragDistance = 8;

function inside(rect: DOMRect, point: { x: number; y: number }) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}
