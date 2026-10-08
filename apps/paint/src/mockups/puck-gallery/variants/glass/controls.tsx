import type { JSX } from '@solidjs/web';
import { createSignal, For } from 'solid-js';
import { pressHandlers, type Press } from '../../kit/pressHandlers';
import { formatValue, fractionOf, stepPreset, valueAt, type NumberSetting } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import css from './glass.module.css';
import { placed, type Box } from './layout';

/**
 * A button that acts when a press lifts over it: a tap, or a slide that ends on the button, as a click would, for the
 * pen, a finger and the mouse alike. Its handlers are created once: a JSX spread of a call, such as
 * `{...tapProps(…)}`, is re-evaluated whenever another attribute of the element changes, which would replace the
 * handlers and lose a press in progress.
 */
export function TapButton(props: {
  onTap: (event: PointerEvent) => void;
  class?: JSX.ClassValue;
  style?: JSX.CSSProperties;
  title?: string;
  children?: JSX.Element;
}) {
  const tap = tapProps((event) => props.onTap(event));
  return (
    <button type="button" class={props.class} style={props.style} title={props.title} {...tap}>
      {props.children}
    </button>
  );
}

/**
 * Press handlers for an element that acts when the press lifts over it, as `TapButton` does. Create the result once
 * and spread the variable (`const tap = tapProps(…)`, `<div {...tap}>`), for the reason `TapButton` gives.
 */
export function tapProps(action: (event: PointerEvent) => void) {
  return pressHandlers({
    tap: (_press, event) => action(event),
    end: (press, event) => {
      if (isOver(press.target, press.point)) {
        action(event);
      }
    }
  });
}

/**
 * Turns wheel events into steps of one, up positive: a mouse notch is one step, a trackpad's small deltas add up to
 * one. Consumes the event.
 */
export function wheelSteps(step: (direction: 1 | -1) => void) {
  let total = 0;
  return (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
    if (Math.sign(delta) !== Math.sign(total)) {
      total = 0;
    }

    total += delta;
    if (Math.abs(delta) >= notch || Math.abs(total) >= notch) {
      total = 0;
      step(delta < 0 ? 1 : -1);
    }
  };
}

/** The wheel distance of one step. */
const notch = 50;

/**
 * A number as a wide pill that fills from the left (from zero for ranges around it): drag sideways anywhere on it to
 * change the value relative to where it was, a whole width for the whole range (geometric for log settings; four
 * widths with Shift). A tap on either side of the fill's edge steps to the next preset, as the wheel does.
 */
export function PillScrubber(props: {
  setting: NumberSetting;
  value: number;
  onChange: (value: number) => void;
  /** The text inside the pill; the setting's label by default. */
  label?: string;
  /** A drag starts (`true`) or ends (`false`), e.g. for a preview. */
  onActive?: (active: boolean) => void;
}) {
  const [dragging, setDragging] = createSignal(false);
  const fraction = () => fractionOf(props.setting, props.value);
  const zero = () => (props.setting.min < 0 && props.setting.max > 0 ? fractionOf(props.setting, 0) : 0);
  const onWheel = wheelSteps((direction) => props.onChange(stepPreset(props.setting, props.value, direction)));
  const scrub = createScrub({
    axis: 'x',
    fraction,
    onChange: (next) => props.onChange(valueAt(props.setting, next)),
    onStep: (direction) => props.onChange(stepPreset(props.setting, props.value, direction)),
    onActive: (active) => {
      setDragging(active);
      props.onActive?.(active);
    }
  });

  return (
    <div class={[css.pill, { [css.active!]: dragging() }]} {...scrub} onWheel={onWheel}>
      <span
        class={css.pillFill}
        style={{
          left: `${Math.min(zero(), fraction()) * 100}%`,
          width: `${Math.abs(fraction() - zero()) * 100}%`
        }}
      />
      <span class={css.pillLabel}>{props.label ?? props.setting.label}</span>
      <span class={css.pillValue}>
        {formatValue(props.value)}
        {props.setting.unit === '%' || props.setting.unit === '°' ? props.setting.unit : ` ${props.setting.unit}`}
      </span>
    </div>
  );
}

/**
 * A number as a short vertical capsule beside the QuickMenu, after Procreate's sidebar sliders: the fill grows from
 * the bottom; drag up or down anywhere on it (geometric for log settings), tap above or below the thumb or turn the
 * wheel to step through presets. Disabled when the tool has no such setting.
 */
export function Capsule(props: {
  setting: NumberSetting | undefined;
  value: number;
  onChange: (value: number) => void;
  /** The tooltip, such as "Brush size". */
  title: string;
  /** A small mark at the bottom of the capsule that says what it sets. */
  glyph: JSX.Element;
  /** A drag starts (`true`) or ends (`false`), for the brush preview. */
  onActive: (active: boolean) => void;
  box: Box;
  class?: string;
}) {
  const [dragging, setDragging] = createSignal(false);
  const fraction = () => (props.setting ? fractionOf(props.setting, props.value) : 0);
  const step = (direction: 1 | -1) => {
    if (props.setting) {
      props.onChange(stepPreset(props.setting, props.value, direction));
    }
  };
  const onWheel = wheelSteps(step);
  const scrub = createScrub({
    axis: 'y',
    // The capsule is short: the whole range takes two of its lengths, so that each step stays in reach of a finger.
    reach: 2,
    fraction,
    onChange: (next) => props.setting && props.onChange(valueAt(props.setting, next)),
    onStep: step,
    onActive: (active) => {
      setDragging(active);
      props.onActive(active);
    },
    enabled: () => props.setting !== undefined
  });

  return (
    <div
      class={[css.capsule, props.class, { [css.active!]: dragging(), [css.disabled!]: !props.setting }]}
      style={placed(props.box)}
      {...galleryUi}
      title={props.title}
      {...scrub}
      onWheel={onWheel}
    >
      <span class={css.capsuleFill} style={{ height: `${fraction() * 100}%` }} />
      <span class={css.capsuleGlyph}>{props.glyph}</span>
      <span
        class={css.capsuleThumb}
        style={{ bottom: `calc(${thumbInset}px + (100% - ${thumbInset * 2}px) * ${fraction()})` }}
      />
    </div>
  );
}

/**
 * The press-drag behind the pill and the capsule: drags move a fraction relative to where it was, by `reach` element
 * lengths (one by default) for the whole range, four times that with Shift, which may change mid-drag; taps step
 * toward the side of the fill's edge that was tapped. Returns press handlers to spread on the element.
 */
function createScrub(options: {
  axis: 'x' | 'y';
  reach?: number;
  /** The value's place in its range, 0–1. */
  fraction: () => number;
  onChange: (fraction: number) => void;
  onStep: (direction: 1 | -1) => void;
  onActive: (active: boolean) => void;
  enabled?: () => boolean;
}) {
  /** The unrounded fraction during a drag, so that small moves add up and Shift can change without a jump. */
  let current = 0;
  const length = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    return options.axis === 'x' ? rect.width : rect.height;
  };

  return pressHandlers({
    start: () => {
      if (options.enabled && !options.enabled()) {
        return false;
      }

      current = options.fraction();
      options.onActive(true);
    },
    move: (press) => {
      if (!press.moved) {
        return;
      }

      const along = options.axis === 'x' ? press.delta.x : -press.delta.y;
      const reach = (options.reach ?? 1) * (press.shift ? 4 : 1);
      current = Math.min(1, Math.max(0, current + along / (length(press) * reach)));
      options.onChange(current);
    },
    end: () => options.onActive(false),
    tap: (press) => {
      options.onActive(false);
      const rect = press.target.getBoundingClientRect();
      const fill = options.fraction();
      const ahead =
        options.axis === 'x'
          ? press.point.x >= rect.left + rect.width * fill
          : press.point.y <= rect.bottom - rect.height * fill;
      options.onStep(ahead ? 1 : -1);
    },
    cancel: () => options.onActive(false)
  });
}

/** Keeps the capsule's thumb clear of its rounded ends. */
const thumbInset = 8;

/** An on/off setting as a row with an iOS switch; the whole row toggles. */
export function SwitchRow(props: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <TapButton class={css.switchRow} onTap={() => props.onToggle()}>
      <span>{props.label}</span>
      <span class={[css.switch, { [css.on!]: props.on }]}>
        <span class={css.knob} />
      </span>
    </TapButton>
  );
}

/** A choice as an iOS segmented control under its label; segments size to their text. */
export function Segmented(props: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (option: string) => void;
}) {
  return (
    <div class={css.segmentedRow}>
      <span class={css.caption}>{props.label}</span>
      <div class={css.segmented}>
        <For each={props.options}>
          {(option) => (
            <TapButton
              class={[css.segment, { [css.on!]: props.value === option }]}
              onTap={() => props.onChange(option)}
            >
              {option}
            </TapButton>
          )}
        </For>
      </div>
    </div>
  );
}

function isOver(element: Element, point: { x: number; y: number }) {
  const rect = element.getBoundingClientRect();
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}
