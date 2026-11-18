import { createMemo, createSignal, Show } from 'solid-js';
import {
  PressureCurveEditor,
  pressureCurvePath,
  type CurveHandle
} from '../../../features/brush-editor/PressureCurveEditor';
import { pressHandlers } from '../../../shared/ui/pressHandlers';
import type { Span } from '../board';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import type { LookSpec } from '../looks';
import { brushChannels, brushSettingKind } from './brushChannels';
import { definePart, type PartBinding } from './definition';
import { NumberKeypad, ValueEntryCard } from './ValueEntry';

/** The part's name, on the board and over its graph; declared before the part, which reads it as it is defined. */
const curveLabel = 'Pressure curve';

/**
 * The brush's pressure curve as a part (`PressureCurveEditor` in the board's tiles), entering the board from the brush
 * studio, where its row is this part itself. From {@link pressureCurveMinimum} up it is the graph with its three
 * handles, its name above it from four rows; smaller, it is a small picture of the curve that opens the graph in a
 * popup. Each handle edits its number through that number's own channel (`brush:pressure-minimum` and the others),
 * as the number parts on the board do, so every copy of the curve and of its numbers shows the same values. A tap on a
 * handle's chip opens the keypad for that number. While the curve does not apply to the brush, it shows greyed and
 * takes no edits.
 */
export const pressureCurvePart = definePart({
  kind: brushSettingKind('pressure-curve'),
  family: 'value',
  section: 'Values',
  studioOnly: true,
  label: curveLabel,
  looks: {
    looks: [
      { id: 'icon', label: 'Picture', min: { columns: 1, rows: 1 } },
      { id: 'curve', label: 'Curve', min: pressureCurveMinimum() }
    ] satisfies readonly LookSpec[],
    auto: (span) =>
      span.columns >= pressureCurveMinimum().columns && span.rows >= pressureCurveMinimum().rows ? 'curve' : 'icon'
  },
  needs: curveNeeds,
  View: PressureCurvePart,
  popup: {
    needs: curveNeeds,
    View: (props) => (
      <div class={styles.popupCurve}>
        <PressureCurvePart {...props} look="curve" span={pressureCurveSpan} />
      </div>
    )
  }
});

/** The span a curve takes on the board when it is lifted from the studio: room for its handles and chips. */
export const pressureCurveSpan: Span = { columns: 4, rows: 4 };

/** The smallest span the graph shows at: three cells each way, where the pen can still tell its handles apart. */
export function pressureCurveMinimum(): Span {
  return { columns: 3, rows: 3 };
}

/** The graph, or the small picture of the curve that opens it, and the keypad a chip opens. */
function PressureCurvePart(props: ReturnType<typeof curveNeeds>) {
  const [entry, setEntry] = createSignal<{ handle: CurveHandle; anchor: Element }>();
  const open = pressHandlers({
    start: () => props.active,
    tap: (press) => props.onOpen(press.target)
  });
  /** The keypad's key handler, which it hands over as it is made; see `NumberKeypad`'s `keys`. */
  let keypadKeys: ((event: KeyboardEvent) => boolean) | undefined;

  return (
    <div
      class={styles.curvePart}
      data-inactive={props.active ? undefined : ''}
      aria-disabled={props.active ? undefined : 'true'}
    >
      <Show
        when={props.look === 'curve'}
        fallback={
          <div
            class={styles.curvePicture}
            role="button"
            tabindex={props.active ? 0 : -1}
            aria-label={props.label}
            {...open}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={props.picture} />
            </svg>
          </div>
        }
      >
        <Show when={props.span.rows >= 4}>
          <span class={styles.curveCaption}>{props.label}</span>
        </Show>
        <PressureCurveEditor
          class={styles.curveEditor}
          label={props.label}
          minimum={props.minimum}
          maximum={props.maximum}
          firmness={props.firmness}
          disabled={!props.active}
          onStart={props.onStart}
          onInput={props.onInput}
          onCancel={props.onCancel}
          onEntry={(handle, anchor) => setEntry({ handle, anchor })}
        />
      </Show>
      <Show when={entry()}>
        {(open) => (
          <ValueEntryCard
            anchor={open().anchor}
            label={props.number(open().handle).label}
            onCancel={() => setEntry(undefined)}
            onKey={(event) => keypadKeys?.(event) ?? false}
          >
            <NumberKeypad
              label={props.number(open().handle).label}
              value={props.number(open().handle).value}
              min={props.number(open().handle).min}
              max={props.number(open().handle).max}
              step={props.number(open().handle).step}
              unit="%"
              onCommit={(value) => {
                const handle = open().handle;
                setEntry(undefined);
                props.onNumber(handle, value);
              }}
              onCancel={() => setEntry(undefined)}
              keys={(handler) => (keypadKeys = handler)}
            />
          </ValueEntryCard>
        )}
      </Show>
    </div>
  );
}

/**
 * The curve's observations and guarded edits: its three numbers' channels, read and written in percent as the number
 * parts do, the brush's stroke for the curve itself, and the values at a press's start, which a cancelled press
 * restores.
 */
function curveNeeds(services: LegoServices, frame: PartBinding) {
  const stroke = createMemo(() => services.brushEditor.channelBrush().stroke);
  const active = createMemo(() => handles.every((handle) => channelOf(handle).active?.(services) ?? true));
  let start: Record<CurveHandle, number> | undefined;
  const write = (handle: CurveHandle, percent: number) => {
    if (active()) {
      channelOf(handle).write(services, percent, services.color.hsv());
    }
  };

  return {
    label: curveLabel,
    get span() {
      return frame.span;
    },
    get look() {
      return frame.look;
    },
    get active() {
      return active();
    },
    get minimum() {
      return stroke().minimum;
    },
    get maximum() {
      return stroke().maximum;
    },
    get firmness() {
      return stroke().firmness;
    },
    /** The small picture's path, the graph's own curve. */
    get picture() {
      return pressureCurvePath(stroke());
    },
    /** `handle`'s number as the keypad offers it, in percent within its live bounds. */
    number: (handle: CurveHandle) => {
      const channel = channelOf(handle);
      return {
        label: channel.label,
        value: Math.round(channel.read(services) / (channel.step ?? 1)) * (channel.step ?? 1),
        min: channel.minimum?.(services) ?? channel.min,
        max: channel.max(services),
        step: channel.step
      };
    },
    onStart: frame.command(() => {
      const { minimum, maximum, firmness } = stroke();
      start = { minimum, maximum, firmness };
    }),
    onInput: frame.command((handle: CurveHandle, value: number) => write(handle, value * 100)),
    onNumber: frame.command((handle: CurveHandle, percent: number) => write(handle, percent)),
    onCancel: frame.command(() => {
      if (start) {
        // The bounds of each end follow the other, so the ends go back in the order that keeps them apart.
        const order: CurveHandle[] =
          start.minimum < stroke().minimum ? ['minimum', 'maximum', 'firmness'] : ['maximum', 'minimum', 'firmness'];
        order.forEach((handle) => write(handle, start![handle] * 100));
      }

      start = undefined;
    }),
    onOpen: (anchor: Element) => frame.onPopup(anchor, { kind: 'part', partKind: frame.kind })
  };
}

const handles: readonly CurveHandle[] = ['minimum', 'maximum', 'firmness'];

/**
 * The channel of the curve's number `handle`. Looked up when used: the channels and the parts import each other, so
 * the channels are not there yet while this module loads.
 */
function channelOf(handle: CurveHandle) {
  return brushChannels.find((channel) => channel.id === `brush:pressure-${handle}`)!;
}
