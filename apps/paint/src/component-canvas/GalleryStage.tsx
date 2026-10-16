import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, Loading } from 'solid-js';
import { createPalmRejectionSettings } from '../features/palm-rejection';
import { createStudio } from '../mockups/puck-gallery/kit/createStudio';
import type { Point } from '../mockups/puck-gallery/kit/createSketchCanvas';
import type { Summon, VariantInfo } from '../mockups/puck-gallery/kit/variant';
import styles from './ComponentCanvas.module.css';
import { ScreenFrame } from './Screen';
import { Snapshot } from './Snapshot';

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
            open(
              { x: event.clientX, y: event.clientY },
              event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse'
            );
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
 * A still of a Puck gallery variant open in the middle of a screen as large as the window, drawn at `scale`: the
 * variants lay themselves out for the window, and they listen to its keys and hover, so the canvas keeps a picture
 * (see `Snapshot`) and opens the live one with `GalleryStage`.
 */
export function GalleryStill(props: { variant: VariantInfo; scale: number }) {
  const size = { width: innerWidth, height: innerHeight };

  return (
    <div style={{ width: `${size.width * props.scale}px`, height: `${size.height * props.scale}px` }}>
      <div style={{ transform: `scale(${props.scale})`, 'transform-origin': '0 0' }}>
        <ScreenFrame width={size.width} height={size.height}>
          <Snapshot render={() => <OpenVariant variant={props.variant} />} />
        </ScreenFrame>
      </div>
    </div>
  );
}

/** A gallery variant summoned pinned in the middle of the window on a mock studio of its own, doing nothing else. */
function OpenVariant(props: { variant: VariantInfo }) {
  const Variant = props.variant.component;
  const middle = { x: innerWidth / 2, y: innerHeight / 2 };

  return (
    <Loading fallback={null}>
      <Variant
        studio={createStudio()}
        summon={{ serial: 1, at: middle, mode: 'pinned', source: 'gallery', pointerType: 'pen' }}
        pointer={middle}
        hand="right"
        hidden={false}
        close={() => {}}
        done={() => {}}
        open={() => {}}
        onHoldRelease={() => {}}
      />
    </Loading>
  );
}
