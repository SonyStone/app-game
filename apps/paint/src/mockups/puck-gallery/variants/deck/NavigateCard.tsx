import type { JSX } from '@solidjs/web';
import { createSignal, For } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { navigationDrag, type NavigationKind } from '../../kit/navigationDrag';
import type { Press } from '../../kit/pressHandlers';
import { Kbd, signedAngle } from './cards';
import { pressable, TapButton } from './controls';
import styles from './Deck.module.css';

/** A navigation drag in progress, for the overlay that replaces the hidden deck: what it does and where it is. */
export type NavigationView = { kind: NavigationKind; point: Point; pivot: Point };

/**
 * The Puck as a card: three big press-drag zones (Pan, Zoom, Rotate) with live readouts, the history as an
 * Undo | Redo bar that also scrubs, and Fit, Flip, Symmetry. Zoom and Rotate turn around `pivot`, where the deck was
 * summoned; a tap on Zoom returns to 100%, on Rotate to 0°. `onNavigate` reports a drag once it moves and
 * `undefined` when it ends, so that the deck can hide meanwhile.
 */
export function NavigateCard(props: {
  studio: Studio;
  pivot: Point;
  onNavigate: (view: NavigationView | undefined) => void;
}) {
  const drag = navigationDrag(props.studio);
  const zoomPercent = () => Math.round(props.studio.view().scale * 100);
  const angle = () => signedAngle(props.studio.view().angle);
  /** Press-drag handlers of one zone; `tap` is the zone's reset. */
  const zone = (kind: NavigationKind, tap?: () => void) =>
    pressable({
      start(press) {
        drag.start(kind, press.point, kind === 'pan' ? undefined : props.pivot);
      },
      move(press) {
        if (!press.moved) {
          return;
        }

        drag.move(press.point, press.shift);
        props.onNavigate({ kind, point: press.point, pivot: props.pivot });
      },
      tap() {
        drag.end();
        tap?.();
      },
      end() {
        drag.end();
        props.onNavigate(undefined);
      },
      cancel() {
        drag.end();
        props.onNavigate(undefined);
      }
    });
  // Created once: each call holds its own press, so the handlers must not be rebuilt while the card is up.
  const panZone = zone('pan');
  const zoomZone = zone('zoom', () => props.studio.zoomTo(1, props.pivot));
  const rotateZone = zone('rotate', () => props.studio.rotateTo(0));

  return (
    <div class={styles.navigate}>
      <div class={styles.zones}>
        <Zone label="Pan" readout="drag" hint="any way" handlers={panZone}>
          <span class={styles.panMark}>
            <SketchIcon name="move" size={34} />
          </span>
        </Zone>
        <Zone
          label="Zoom"
          readout={`${zoomPercent()}%`}
          hint="tap 100%"
          handlers={zoomZone}
          onWheel={(event) => {
            event.preventDefault();
            props.studio.zoomBy(event.deltaY > 0 ? 1 / 1.12 : 1.12, props.pivot);
          }}
        >
          <ZoomLadder scale={props.studio.view().scale} />
        </Zone>
        <Zone
          label="Rotate"
          readout={`${angle()}°`}
          hint="tap 0°"
          handlers={rotateZone}
          onWheel={(event) => {
            event.preventDefault();
            props.studio.rotateBy(event.deltaY > 0 ? 5 : -5, props.pivot);
          }}
        >
          <Dial angle={props.studio.view().angle} />
        </Zone>
      </div>

      <HistoryBar studio={props.studio} />

      <div class={styles.viewRow}>
        <TapButton class={styles.viewButton} title="Fit the drawing (F)" onTap={() => props.studio.fit()}>
          <SketchIcon name="fullscreen" size={16} />
          Fit
          <Kbd>F</Kbd>
        </TapButton>
        <TapButton
          class={styles.viewButton}
          title="Flip the view (H)"
          on={props.studio.view().flipped}
          onTap={() => props.studio.flip()}
        >
          <SketchIcon name="mirror" size={16} />
          Flip
          <Kbd>H</Kbd>
        </TapButton>
        <TapButton
          class={styles.viewButton}
          title="Mirror strokes (S)"
          on={props.studio.symmetry()}
          onTap={() => props.studio.toggleSymmetry()}
        >
          <SketchIcon name="symmetry" size={16} />
          Symmetry
          <Kbd>S</Kbd>
        </TapButton>
      </div>
    </div>
  );
}

/** A big press-drag zone: a label, a live picture of what it changes, the readout and what a tap does. */
function Zone(props: {
  label: string;
  readout: string;
  hint: string;
  handlers: ReturnType<typeof pressable>;
  onWheel?: (event: WheelEvent) => void;
  children: JSX.Element;
}) {
  return (
    <div class={styles.zone} onWheel={(event) => props.onWheel?.(event)} {...props.handlers}>
      <span class={styles.zoneLabel}>{props.label}</span>
      <span class={styles.zonePicture}>{props.children}</span>
      <span class={styles.zoneReadout}>{props.readout}</span>
      <span class={styles.zoneHint}>{props.hint}</span>
    </div>
  );
}

/** The zoom as a marker on a ladder of doublings, 5%–1600%, with 100% marked. */
function ZoomLadder(props: { scale: number }) {
  const position = (scale: number) => 1 - Math.log(scale / minZoom) / Math.log(maxZoom / minZoom);
  return (
    <svg class={styles.ladder} viewBox="0 0 40 60" aria-hidden="true">
      <For each={ladderStops}>
        {(stop) => (
          <line
            x1={stop === 1 ? 8 : 14}
            x2={stop === 1 ? 32 : 26}
            y1={4 + position(stop) * 52}
            y2={4 + position(stop) * 52}
            class={stop === 1 ? styles.ladderMain : styles.ladderTick}
          />
        )}
      </For>
      <path
        d="M4 0 10 4 4 8Z"
        class={styles.ladderMarker}
        style={{ transform: `translateY(${position(Math.min(maxZoom, Math.max(minZoom, props.scale))) * 52}px)` }}
      />
    </svg>
  );
}

/** The view's angle as a needle on a dial with ticks every 45°. */
function Dial(props: { angle: number }) {
  return (
    <svg class={styles.dial} viewBox="-30 -30 60 60" aria-hidden="true">
      <circle r="24" class={styles.dialRing} />
      <For each={[0, 45, 90, 135, 180, 225, 270, 315]}>
        {(tick) => (
          <line
            y1={-24}
            y2={tick === 0 ? -17 : -20}
            class={tick === 0 ? styles.ladderMain : styles.ladderTick}
            transform={`rotate(${tick})`}
          />
        )}
      </For>
      <g style={{ transform: `rotate(${props.angle}deg)` }} class={styles.dialNeedle}>
        <line y1={4} y2={-21} />
        <circle r="2.5" />
      </g>
    </svg>
  );
}

/**
 * Undo | Redo as one bar: tap a half for one step, drag sideways to scrub through the history (a step per 22 px),
 * or turn the wheel. The ticks below show the strokes done and undone. Repeating, so it never closes the deck.
 */
function HistoryBar(props: { studio: Studio }) {
  const [scrubbed, setScrubbed] = createSignal<number>();
  let applied = 0;
  const stepTo = (target: number) => {
    while (applied > target && props.studio.canUndo()) {
      props.studio.undo();
      applied -= 1;
    }

    while (applied < target && props.studio.canRedo()) {
      props.studio.redo();
      applied += 1;
    }
  };
  const half = (press: Press) => {
    const box = press.target.getBoundingClientRect();
    return press.start.x < box.left + box.width / 2 ? 'undo' : 'redo';
  };
  const press = pressable({
    start() {
      applied = 0;
    },
    move(press) {
      if (!press.moved) {
        return;
      }

      const target = Math.trunc((press.point.x - press.start.x) / 22);
      stepTo(target);
      setScrubbed(applied);
    },
    tap(press) {
      if (half(press) === 'undo') {
        props.studio.undo();
      } else {
        props.studio.redo();
      }
    },
    end: () => setScrubbed(undefined),
    cancel: () => setScrubbed(undefined)
  });
  const ticks = () => {
    const { done, undone } = props.studio.history();
    const shownDone = Math.min(done, 24);
    const shownUndone = Math.min(undone, 24 - Math.min(shownDone, 12));
    return [...Array<boolean>(shownDone).fill(true), ...Array<boolean>(shownUndone).fill(false)];
  };

  return (
    <div
      class={[styles.history, { [styles.scrubbing!]: scrubbed() !== undefined }]}
      title="Tap Undo or Redo; drag sideways to scrub the history"
      onWheel={(event) => {
        event.preventDefault();
        if (event.deltaY > 0) {
          props.studio.undo();
        } else {
          props.studio.redo();
        }
      }}
      {...press}
    >
      <span class={[styles.historyHalf, { [styles.disabled!]: !props.studio.canUndo() }]}>
        <SketchIcon name="undo" size={18} />
        <b>Undo</b>
        <small>{props.studio.history().done}</small>
      </span>
      <span class={styles.historyScrub}>
        {scrubbed() === undefined ? '⇠ drag ⇢' : `${scrubbed()! > 0 ? '+' : ''}${scrubbed()}`}
      </span>
      <span class={[styles.historyHalf, styles.redo, { [styles.disabled!]: !props.studio.canRedo() }]}>
        <small>{props.studio.history().undone}</small>
        <b>Redo</b>
        <SketchIcon name="redo" size={18} />
      </span>
      <span class={styles.historyTicks} aria-hidden="true">
        <For each={ticks()} keyed={false}>
          {(done) => <i class={{ [styles.tickDone!]: done() }} />}
        </For>
      </span>
    </div>
  );
}

const minZoom = 0.05;
const maxZoom = 16;
/** Ladder ticks: every doubling from 6.25% to 1600%. */
const ladderStops = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16];
