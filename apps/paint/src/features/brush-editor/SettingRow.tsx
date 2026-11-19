import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, createUniqueId, For, onSettled, Show } from 'solid-js';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './BrushEditor.module.css';
import type { BrushView } from './brushView';
import type { BrushSetting, ChoiceSetting, NumberSetting, ToggleSetting } from './schema';
import { Slider } from './Slider';

/**
 * One generated row of the brush editor for `setting`, which the caller has already found applicable. A row whose
 * setting is not `enabled` keeps its place and shows its value, greyed, and takes no presses. Every change is sent
 * at once as the document text the setting's `write` returns. A choice of up to {@link inlineChoiceLimit} options shows them
 * all; a longer one shows the chosen option in a single row that opens the list.
 */
export function SettingRow(props: { setting: BrushSetting; brush: BrushView; onChange: (text: string) => void }) {
  // A row is made once per setting, so its kind never changes under it.
  const setting = props.setting;
  const enabled = createMemo(() => setting.enabled(props.brush));

  return setting.kind === 'number' ? (
    <NumberRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  ) : setting.kind === 'toggle' ? (
    <ToggleRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  ) : setting.options.length > inlineChoiceLimit ? (
    <MenuRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  ) : (
    <ChoiceRow setting={setting} brush={props.brush} enabled={enabled()} onChange={props.onChange} />
  );
}

/** The most options a choice shows as a list in place; longer choices open theirs from one row. */
export const inlineChoiceLimit = 3;

/** What every row kind receives besides its setting. */
type RowProps = { brush: BrushView; enabled: boolean; onChange: (text: string) => void };

/**
 * A row's visible label. Inside a section it is short, so assistive technology also hears the section's name, as in
 * "Opacity Jitter".
 */
function Label(props: { setting: BrushSetting; id?: string }) {
  return (
    <span id={props.id} class={styles.label}>
      <Show when={props.setting.section}>{(section) => <span class={styles.hidden}>{section()} </span>}</Show>
      {props.setting.label}
    </span>
  );
}

/** The label a row's own fields announce: the section's name and the row's, as {@link Label} reads. */
function spokenLabel(setting: BrushSetting) {
  return setting.section ? `${setting.section} ${setting.label.toLowerCase()}` : setting.label;
}

/** Label, slider, number field and unit. The slider and the field change the value live. */
function NumberRow(props: RowProps & { setting: NumberSetting }) {
  const setting = props.setting;
  const labelId = createUniqueId();
  const value = createMemo(() => setting.read(props.brush));
  const min = createMemo(() => setting.min(props.brush));
  const max = createMemo(() => setting.max(props.brush));
  // Curves are built anew on each call; an equal one must not redraw the slider.
  const curve = createMemo(() => setting.curve?.(props.brush), {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)
  });
  const shown = createMemo(() => {
    const rounded = Math.round(value() / setting.step) * setting.step;
    return setting.format ? setting.format(rounded) : `${Number(rounded.toFixed(4))}`;
  });
  const write = (next: number) => {
    const text = setting.write(props.brush, next);
    if (text !== props.brush.text) {
      props.onChange(text);
    }
  };

  return (
    <div
      class={styles.row}
      data-kind="number"
      data-disabled={props.enabled ? undefined : ''}
      style={setting.unit ? { '--unit-chars': String(setting.unit.length) } : undefined}
    >
      <Label setting={setting} id={labelId} />
      <Slider
        labelledBy={labelId}
        value={value()}
        min={min()}
        max={max()}
        step={setting.step}
        curve={curve()}
        valueText={`${shown()}${setting.unit ? ` ${setting.unit}` : ''}`}
        disabled={!props.enabled}
        onInput={write}
      />
      <Show
        when={!setting.format}
        fallback={
          <output class={styles.formatted} aria-labelledby={labelId}>
            {shown()}
          </output>
        }
      >
        <ScrubNumber
          label={spokenLabel(setting)}
          value={value()}
          min={min()}
          max={max()}
          step={setting.step}
          scale={setting.curve ? 'log' : 'linear'}
          disabled={!props.enabled}
          onInput={write}
          onChange={write}
        />
      </Show>
      <span class={styles.unit}>{setting.unit}</span>
    </div>
  );
}

/** A full-width switch: the whole row flips it. */
function ToggleRow(props: RowProps & { setting: ToggleSetting }) {
  const setting = props.setting;
  const on = createMemo(() => setting.read(props.brush));

  return (
    <button
      type="button"
      class={styles.row}
      data-kind="toggle"
      role="switch"
      aria-checked={on() ? 'true' : 'false'}
      disabled={!props.enabled}
      onClick={() => props.onChange(setting.write(props.brush, !on()))}
    >
      <span class={styles.box}>
        <Show when={on()}>
          <SketchIcon name="check" size={16} />
        </Show>
      </span>
      <Label setting={setting} />
    </button>
  );
}

/** The options as a visible list, each a full-width row, with the chosen one marked. */
function ChoiceRow(props: RowProps & { setting: ChoiceSetting }) {
  const setting = props.setting;
  const labelId = createUniqueId();
  const chosen = createMemo(() => setting.read(props.brush));

  return (
    <div
      class={styles.choice}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-disabled={props.enabled ? undefined : 'true'}
      data-disabled={props.enabled ? undefined : ''}
    >
      <Label setting={setting} id={labelId} />
      <For each={setting.options}>
        {(option) => (
          <button
            type="button"
            class={styles.option}
            role="radio"
            aria-checked={chosen() === option.value ? 'true' : 'false'}
            disabled={!props.enabled}
            onClick={() => {
              if (chosen() !== option.value) {
                props.onChange(setting.write(props.brush, option.value));
              }
            }}
          >
            <span class={styles.dot} />
            <span>{option.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * A choice in one row, laid out as a number row: its label, then a button across the slider and the field that names
 * the chosen option. A press on the button opens the list of options over the editor, next to the button and inside
 * the editor's bounds, so that no row moves. A press on an option chooses it and closes the list; a press outside it,
 * Escape, a scroll or a resize closes it without a change. Arrow keys move between the options.
 */
function MenuRow(props: RowProps & { setting: ChoiceSetting }) {
  const setting = props.setting;
  const labelId = createUniqueId();
  const valueId = createUniqueId();
  const chosen = createMemo(() => setting.read(props.brush));
  const chosenLabel = createMemo(() => setting.options.find((option) => option.value === chosen())?.label ?? '');
  const [open, setOpen] = createSignal(false);
  let button!: HTMLButtonElement;
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      button.focus({ preventScroll: true });
    }
  };

  return (
    <div class={styles.menuChoice} data-disabled={props.enabled ? undefined : ''}>
      <div class={styles.row} data-kind="menu">
        <Label setting={setting} id={labelId} />
        <button
          ref={(element) => (button = element)}
          type="button"
          class={styles.menuButton}
          aria-haspopup="listbox"
          aria-expanded={open() ? 'true' : 'false'}
          aria-labelledby={`${labelId} ${valueId}`}
          disabled={!props.enabled}
          onClick={() => setOpen(!open())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span id={valueId} class={styles.menuValue}>
            {chosenLabel()}
          </span>
          <SketchIcon name="down" size={16} />
        </button>
      </div>
      <Show when={open() && props.enabled}>
        <MenuList
          anchor={button}
          labelledBy={labelId}
          setting={setting}
          chosen={chosen()}
          onChoose={(value) => {
            close(true);
            if (value !== chosen()) {
              props.onChange(setting.write(props.brush, value));
            }
          }}
          onClose={close}
        />
      </Show>
    </div>
  );
}

/**
 * The open list of a {@link MenuRow}: placed under its anchor, or above it when there is more room there, as wide as
 * the anchor or wider, and scrolled within itself when the editor is too short for all options. Focuses the chosen
 * option when it opens. `onClose` receives whether the anchor should take the focus back.
 */
function MenuList(props: {
  anchor: HTMLElement;
  labelledBy: string;
  setting: ChoiceSetting;
  chosen: string;
  onChoose: (value: string) => void;
  onClose: (refocus: boolean) => void;
}) {
  let list!: HTMLDivElement;
  const inside = (target: EventTarget | null) =>
    target instanceof Node && (list.contains(target) || props.anchor.contains(target));
  createEventListener(
    document,
    'pointerdown',
    (event) => {
      if (!inside(event.target)) {
        props.onClose(false);
      }
    },
    { capture: true }
  );
  // The list stays where it was placed, so it closes when what it was placed against moves.
  createEventListener(
    document,
    'scroll',
    (event) => {
      if (!(event.target instanceof Node && list.contains(event.target))) {
        props.onClose(false);
      }
    },
    { capture: true }
  );
  createEventListener(window, 'resize', () => props.onClose(false));
  onSettled(() => {
    placeMenu(list, props.anchor);
    const chosen = list.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.querySelector('button');
    if (chosen) {
      list.scrollTop = chosen.offsetTop - (list.clientHeight - chosen.offsetHeight) / 2;
      chosen.focus({ preventScroll: true });
    }
  });
  const move = (by: number | 'first' | 'last') => {
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
    const at = options.indexOf(document.activeElement as HTMLElement);
    const next =
      by === 'first' ? 0 : by === 'last' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, at + by));
    options[next]?.focus();
  };

  return (
    <div
      ref={(element) => (list = element)}
      class={styles.menu}
      role="listbox"
      aria-labelledby={props.labelledBy}
      onKeyDown={(event) => {
        const by =
          event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowUp'
              ? -1
              : event.key === 'Home'
                ? 'first'
                : event.key === 'End'
                  ? 'last'
                  : undefined;
        if (by !== undefined) {
          event.preventDefault();
          move(by);
        } else if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') {
            event.preventDefault();
          }

          props.onClose(event.key === 'Escape');
        }
      }}
    >
      <For each={props.setting.options}>
        {(option) => (
          <button
            type="button"
            class={styles.menuOption}
            role="option"
            aria-selected={props.chosen === option.value ? 'true' : 'false'}
            onClick={() => props.onChoose(option.value)}
          >
            <span class={styles.menuCheck}>
              <Show when={props.chosen === option.value}>
                <SketchIcon name="check" size={16} />
              </Show>
            </span>
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * Places an open menu `list` against `anchor` within the brush editor's frame: below the anchor, or above it when
 * the options do not fit below and there is more room above, and never wider or taller than the frame. The list is
 * positioned absolutely; its offset parent is the frame, so no scrolling pane between them clips it.
 */
function placeMenu(list: HTMLElement, anchor: HTMLElement) {
  const bounds = (anchor.closest(`.${styles.frame}`) ?? document.body).getBoundingClientRect();
  const origin = (list.offsetParent ?? document.body).getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const width = Math.min(bounds.width - menuGap * 2, Math.max(at.width, 180));
  list.style.width = `${width}px`;
  const below = bounds.bottom - at.bottom - menuGap * 2;
  const above = at.top - bounds.top - menuGap * 2;
  const natural = list.scrollHeight;
  const down = natural <= below || below >= above;
  const height = Math.max(0, Math.min(natural, down ? below : above));
  const left = Math.max(bounds.left + menuGap, Math.min(at.left, bounds.right - menuGap - width));
  list.style.left = `${left - origin.left}px`;
  list.style.top = `${(down ? at.bottom + menuGap : at.top - menuGap - height) - origin.top}px`;
  list.style.maxHeight = `${height}px`;
  list.style.visibility = 'visible';
}

/** Space between an open menu and its button, and between the menu and the editor's edge. */
const menuGap = 4;
