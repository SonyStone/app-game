import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, Show } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../../../features/color/hsv';
import type { Point } from '../../kit/createSketchCanvas';
import { pressHandlers } from '../../kit/pressHandlers';
import { formatValue, fractionOf, stepPreset, valueAt, type NumberSetting } from '../../kit/values';
import styles from './pie.module.css';

/**
 * Blender's number slider: the label on the left, the value on the right and the filled part showing where the value
 * lies in its range (geometrically for sizes). Drag sideways to change it — a full sweep of the range takes 320 px,
 * Shift for a tenth of that — or scroll over it, a preset step per notch. A tap opens `onTap`, a pie of preset values.
 */
export function ValueField(props: {
  setting: NumberSetting;
  value: number;
  onChange: (value: number) => void;
  onTap?: (at: Point) => void;
}) {
  let start = 0;
  const handlers = pressHandlers({
    start() {
      start = fractionOf(props.setting, props.value);
    },
    move(press) {
      if (!press.moved) {
        return;
      }

      const travel = (press.point.x - press.start.x) / (press.shift ? 3200 : 320);
      props.onChange(valueAt(props.setting, start + travel));
    },
    tap: (press) => props.onTap?.(press.point)
  });

  return (
    <div
      class={styles.field}
      data-pie-widget
      role="slider"
      aria-label={props.setting.label}
      aria-valuenow={props.value}
      title={`${props.setting.label}: drag sideways, scroll, or tap for presets`}
      style={{ '--fill': `${fractionOf(props.setting, props.value) * 100}%` }}
      {...handlers}
      onWheel={(event) => {
        event.preventDefault();
        props.onChange(stepPreset(props.setting, props.value, event.deltaY < 0 ? 1 : -1));
      }}
    >
      <span>{props.setting.label}</span>
      <b>
        {formatValue(props.value)}
        <small>{props.setting.unit}</small>
      </b>
    </div>
  );
}

/**
 * Blender's dropdown: the current option with a chevron; a tap opens the options as a menu under it, scrolling over
 * it steps through them.
 */
export function ChoiceField(props: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  /** Shows an option's name; the option itself by default. */
  format?: (option: string) => string;
}) {
  const [menu, setMenu] = createSignal<DOMRect>();
  const name = (option: string) => (props.format ?? ((text: string) => text))(option);
  const handlers = pressHandlers({
    tap: (press) => setMenu(menu() ? undefined : press.target.getBoundingClientRect()),
    end: (press) => setMenu(menu() ? undefined : press.target.getBoundingClientRect())
  });

  return (
    <>
      <div
        class={[styles.field, styles.choice]}
        data-pie-widget
        role="button"
        aria-haspopup="listbox"
        aria-label={props.label}
        {...handlers}
        onWheel={(event) => {
          event.preventDefault();
          const index = props.options.indexOf(props.value);
          const next =
            props.options[(index + (event.deltaY > 0 ? 1 : -1) + props.options.length) % props.options.length];
          if (next) {
            props.onChange(next);
          }
        }}
      >
        <span>{props.label}</span>
        <b>
          {name(props.value)} <i>▾</i>
        </b>
      </div>
      <Show when={menu()}>
        {(box) => (
          <ListMenu
            at={{ x: box().left, y: box().bottom + 2 }}
            width={box().width}
            options={props.options}
            value={props.value}
            format={name}
            onChoose={(option) => {
              props.onChange(option);
              setMenu(undefined);
            }}
            onDismiss={() => setMenu(undefined)}
          />
        )}
      </Show>
    </>
  );
}

/**
 * A Blender menu of options, opened at `at` (kept inside the window): tap or slide-and-lift to choose; a press outside
 * or Escape dismisses it. Arrow keys move, Enter chooses.
 */
export function ListMenu(props: {
  at: Point;
  width: number;
  options: readonly string[];
  value: string;
  format: (option: string) => string;
  onChoose: (option: string) => void;
  onDismiss: () => void;
}) {
  const [focus, setFocus] = createSignal(Math.max(0, props.options.indexOf(props.value)));
  let element!: HTMLDivElement;
  const rowHeight = 26;
  const height = () => props.options.length * rowHeight + 8;
  const top = () => Math.min(props.at.y, innerHeight - height() - 8);
  const left = () => Math.min(props.at.x, innerWidth - props.width - 8);
  const optionAt = (point: Point) => {
    const box = element.getBoundingClientRect();
    if (point.x < box.left || point.x > box.right) {
      return undefined;
    }

    return props.options[Math.floor((point.y - box.top - 4) / rowHeight)];
  };

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (!element.contains(event.target as Node)) {
        props.onDismiss();
      }
    },
    { capture: true }
  );
  createEventListener(
    window,
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        props.onDismiss();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setFocus(
          (index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + props.options.length) % props.options.length
        );
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        props.onChoose(props.options[focus()]!);
      }
    },
    { capture: true }
  );

  return (
    <div
      ref={element}
      class={styles.menu}
      data-gallery-ui
      data-pie-widget
      role="listbox"
      style={{ left: `${left()}px`, top: `${top()}px`, width: `${props.width}px` }}
      {...pressHandlers({
        move: (press) => {
          const option = optionAt(press.point);
          if (option) {
            setFocus(props.options.indexOf(option));
          }
        },
        tap: (press) => {
          const option = optionAt(press.point);
          if (option) {
            props.onChoose(option);
          }
        },
        end: (press) => {
          const option = optionAt(press.point);
          if (option) {
            props.onChoose(option);
          }
        }
      })}
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch' && event.buttons === 0) {
          const option = optionAt({ x: event.clientX, y: event.clientY });
          if (option) {
            setFocus(props.options.indexOf(option));
          }
        }
      }}
    >
      <For each={props.options}>
        {(option, index) => (
          <div
            class={[styles.menuRow, { [styles.lit!]: focus() === index(), [styles.active!]: option === props.value }]}
            role="option"
            aria-selected={option === props.value ? 'true' : 'false'}
          >
            {props.format(option)}
          </div>
        )}
      </For>
    </div>
  );
}

/** Blender's checkbox: a small square that shows a check, with its label; a tap flips it. */
export function ToggleField(props: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div
      class={[styles.field, styles.toggle]}
      data-pie-widget
      role="checkbox"
      aria-checked={props.value ? 'true' : 'false'}
      {...pressHandlers({ tap: () => props.onChange(!props.value), end: () => undefined })}
    >
      <i class={styles.check}>{props.value ? '✓' : ''}</i>
      <span>{props.label}</span>
    </div>
  );
}

/**
 * Blender's color wheel: hue around the disc and saturation from its middle outward, with the value as a bar beside
 * it. Drags apply live through `onChange`; `onCommit` ends the edit when the press lifts. The wheel keeps the hue and
 * saturation it was set to while the value is black or the color grey, so dragging through them loses nothing.
 */
export function ColorWheel(props: {
  color: string;
  size: number;
  onChange: (color: string) => void;
  onCommit: () => void;
}) {
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  const radius = () => props.size / 2;
  const edit = (next: Hsv) => {
    setHsv(next);
    props.onChange(hsvToHex(next));
  };
  const wheelAt = (press: { point: Point; target: Element }) => {
    const box = press.target.getBoundingClientRect();
    const dx = press.point.x - (box.left + box.width / 2);
    const dy = press.point.y - (box.top + box.height / 2);
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    edit({ ...hsv(), h, s: Math.min(1, Math.hypot(dx, dy) / (box.width / 2)) });
  };
  const valueAtPress = (press: { point: Point; target: Element }) => {
    const box = press.target.getBoundingClientRect();
    edit({ ...hsv(), v: Math.min(1, Math.max(0, 1 - (press.point.y - box.top) / box.height)) });
  };
  const thumb = () => {
    const angle = (hsv().h * Math.PI) / 180;
    return { x: Math.cos(angle) * hsv().s * radius(), y: Math.sin(angle) * hsv().s * radius() };
  };

  return (
    <div class={styles.wheelBox} data-pie-widget>
      <div
        class={styles.wheel}
        style={{ width: `${props.size}px`, height: `${props.size}px`, '--darken': 1 - hsv().v }}
        {...pressHandlers({
          start: (press) => wheelAt(press),
          move: wheelAt,
          end: () => props.onCommit(),
          tap: () => props.onCommit()
        })}
      >
        <span
          class={styles.wheelThumb}
          style={{ left: `${radius() + thumb().x}px`, top: `${radius() + thumb().y}px`, background: props.color }}
        />
      </div>
      <div
        class={styles.valueBar}
        style={{ height: `${props.size}px`, background: `linear-gradient(${hsvToHex({ ...hsv(), v: 1 })}, #000)` }}
        {...pressHandlers({
          start: (press) => valueAtPress(press),
          move: valueAtPress,
          end: () => props.onCommit(),
          tap: () => props.onCommit()
        })}
      >
        <span class={styles.valueThumb} style={{ top: `${(1 - hsv().v) * 100}%` }} />
      </div>
    </div>
  );
}
