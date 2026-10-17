import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, Errored, Loading, onSettled, untrack } from 'solid-js';
import { createPalmRejectionSettings } from '../features/palm-rejection';
import { createStudio } from '../mockups/puck-gallery/kit/createStudio';
import type { Point } from '../mockups/puck-gallery/kit/createSketchCanvas';
import { markScreen, ScreenContext, type VariantScreen } from '../mockups/puck-gallery/kit/screen';
import type { Summon, VariantInfo } from '../mockups/puck-gallery/kit/variant';
import styles from './ComponentCanvas.module.css';

/**
 * A Puck gallery variant live, full screen, on a mock studio of its own, summoned pinned in the middle as the
 * gallery's Pin does. Closing it leaves a blank screen; a press there summons it again under the press, as a toggle.
 * The gallery's other ways to summon (Space, the pen's side button, a long press) are the gallery page's, not the
 * variant's, so they are left out. The hand is palm rejection's.
 */
export function GalleryStage(props: { variant: VariantInfo }) {
  const Variant = props.variant.component;
  const studio = createStudio();
  const hand = createPalmRejectionSettings().settings().hand;
  const [pointer, setPointer] = createSignal<Point>({ x: innerWidth / 2, y: innerHeight / 2 });
  const [summon, setSummon] = createSignal<Summon | undefined>({
    serial: 1,
    at: { x: innerWidth / 2, y: innerHeight / 2 },
    mode: 'pinned',
    source: 'gallery',
    pointerType: 'pen'
  });
  let serial = 1;
  const open = (at: Point, pointerType: Summon['pointerType']) =>
    setSummon({ serial: ++serial, at, mode: 'toggle', source: 'variant', pointerType });
  createEventListener(window, 'pointermove', (event) => setPointer({ x: event.clientX, y: event.clientY }));

  return (
    <>
      <div
        class={styles.stageSurface}
        onPointerDown={(event) => {
          if (!summon()) {
            open({ x: event.clientX, y: event.clientY }, pointerTypeOf(event));
          }
        }}
      />
      <p class={styles.stageHint}>{summon() ? '' : `Press anywhere to open ${props.variant.name} again.`}</p>
      <Loading fallback={null}>
        <Variant
          studio={studio}
          summon={summon()}
          pointer={pointer()}
          hand={hand}
          hidden={false}
          close={() => setSummon(undefined)}
          done={() => {
            if (summon()?.mode === 'toggle') {
              setSummon(undefined);
            }
          }}
          open={open}
          onHoldRelease={() => {}}
        />
      </Loading>
    </>
  );
}

/**
 * A Puck gallery variant live on the canvas at its own size: summoned pinned in the middle of its `galleryBox`, which
 * is its whole screen (see `VariantScreen`), on a mock studio of its own, without the drawing. Every variant on
 * the canvas stays open at once; each takes the pointer over its box and the keys once pressed. Closing one leaves its
 * box empty, and a press there opens it again; the variant's own entry points, such as the Dial's mini-dial, open it
 * as a toggle. A variant that throws shows its error in its box and leaves the rest of the canvas working.
 */
export function GalleryLive(props: { variant: VariantInfo }) {
  const Variant = props.variant.component;
  const size = galleryBox(untrack(() => props.variant.id));
  const middle = { x: size.width / 2, y: size.height / 2 };
  let box!: HTMLDivElement;
  const screen = createBoxScreen(() => box, size);
  const studio = createStudio();
  const palmSettings = createPalmRejectionSettings().settings;
  const [pointer, setPointer] = createSignal<Point>(middle);
  let serial = 1;
  const [summon, setSummon] = createSignal<Summon | undefined>({
    serial,
    at: middle,
    mode: 'pinned',
    source: 'gallery',
    pointerType: 'pen'
  });
  const open = (at: Point, mode: Summon['mode'], pointerType: Summon['pointerType']) =>
    setSummon({ serial: ++serial, at, mode, source: mode === 'pinned' ? 'gallery' : 'variant', pointerType });
  createEventListener(window, 'pointermove', (event) => {
    if (screen.owns(event)) {
      setPointer(screen.point(event));
    }
  });
  onSettled(() => markScreen(box, screen));

  return (
    <div
      ref={(element) => (box = element)}
      class={styles.liveScreen}
      style={{ width: `${size.width}px`, height: `${size.height}px` }}
      onPointerDown={(event) => {
        if (!summon() && !(event.target instanceof Element && event.target.closest('[data-gallery-ui]'))) {
          open(middle, 'pinned', pointerTypeOf(event));
        }
      }}
    >
      <ScreenContext value={screen}>
        <Errored fallback={(error) => <p class={styles.liveError}>{String(error())}</p>}>
          <Loading fallback={null}>
            <Variant
              studio={studio}
              summon={summon()}
              pointer={pointer()}
              hand={palmSettings().hand}
              hidden={false}
              close={() => setSummon(undefined)}
              done={() => {
                if (summon()?.mode === 'toggle') {
                  setSummon(undefined);
                }
              }}
              open={(at, pointerType) => open(at, 'toggle', pointerType)}
              onHoldRelease={() => {}}
            />
          </Loading>
        </Errored>
      </ScreenContext>
    </div>
  );
}

/** A gallery variant's box on the canvas: room for it open with its menus and panels, and little more. */
export function galleryBox(id: string) {
  return galleryBoxes[id] ?? { width: 560, height: 460 };
}

const galleryBoxes: Partial<Record<string, { width: number; height: number }>> = {
  pie: { width: 600, height: 500 },
  orbit: { width: 800, height: 520 },
  dial: { width: 640, height: 440 },
  pads: { width: 890, height: 660 },
  command: { width: 440, height: 600 },
  hive: { width: 520, height: 560 },
  deck: { width: 560, height: 480 },
  hud: { width: 480, height: 400 },
  glass: { width: 940, height: 740 }
};

/**
 * The screen of a `size` box on the moving canvas: its pixels are the box's own, unscaled at any zoom. It owns the
 * pointer events over the box and those of presses that began there, and the keys while it was the last box pressed,
 * unless they go to a field outside it, such as a specimen's comment.
 */
export function createBoxScreen(box: () => HTMLElement, size: { width: number; height: number }): VariantScreen {
  /** Pointers pressed in the box and not lifted yet. */
  const pressed = new Set<number>();
  const frame = () => {
    const element = box();
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, zoom: rect.width / element.offsetWidth || 1 };
  };
  const screen: VariantScreen = {
    size: () => size,
    top: 8,
    point: (client) => {
      const { left, top, zoom } = frame();
      return { x: (client.clientX - left) / zoom, y: (client.clientY - top) / zoom };
    },
    client: (point) => {
      const { left, top, zoom } = frame();
      return { x: left + point.x * zoom, y: top + point.y * zoom };
    },
    rect: (element) => {
      const { left, top, zoom } = frame();
      const rect = element.getBoundingClientRect();
      return new DOMRect((rect.left - left) / zoom, (rect.top - top) / zoom, rect.width / zoom, rect.height / zoom);
    },
    owns: (event) => {
      const element = box();
      const target = event.target instanceof Node ? event.target : undefined;
      if (event instanceof KeyboardEvent) {
        const field = target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea'));
        return keyScreen === screen && !(field && !element.contains(target));
      }

      if (event instanceof PointerEvent && pressed.has(event.pointerId)) {
        return true;
      }

      return !target || element.contains(target);
    }
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.target instanceof Node && box().contains(event.target)) {
        pressed.add(event.pointerId);
        keyScreen = screen;
      } else if (keyScreen === screen) {
        keyScreen = undefined;
      }
    },
    { capture: true }
  );
  // The lift still belongs to the box for every listener, so the press is forgotten after it has been handled.
  const lift = (event: PointerEvent) => setTimeout(() => pressed.delete(event.pointerId));
  createEventListener(window, 'pointerup', lift, { capture: true });
  createEventListener(window, 'pointercancel', lift, { capture: true });

  return screen;
}

/** The screen that takes the keys: the one last pressed, if any. */
let keyScreen: VariantScreen | undefined;

function pointerTypeOf(event: PointerEvent): Summon['pointerType'] {
  return event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
}
