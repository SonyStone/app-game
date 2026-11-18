import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import styles from '../LegoStudio.module.css';

/**
 * A small card anchored to a value part's slider, over everything: a popover in the browser's top layer, so neither
 * a part's clipping nor a modal dialog covers it. It is rendered inside the part's own element, so it stays inside
 * the brush studio's modal dialog when the part is a studio row (the rest of the page is inert there) and goes away
 * with the part. It lies under the anchor where there is room, otherwise over it, its right edge at the anchor's,
 * kept inside the window.
 *
 * It takes the keyboard while open: keys pressed in it go no further, so Escape reaches neither the studio nor the
 * board's shortcuts, and it calls `onCancel` for Escape and for a press anywhere outside it. Focus returns to what
 * had it once the card closes.
 */
export function ValueEntryCard(props: {
  /** The element the card is placed against, such as the slider's value chip. */
  anchor: Element;
  /** The card's accessible name, such as "Size". */
  label: string;
  /** Escape, or a press outside the card: close it without a change. */
  onCancel: () => void;
  /** Keys the card's content handles; return true for a key it used. Escape is the card's own. */
  onKey?: (event: KeyboardEvent) => boolean;
  children: JSX.Element;
}) {
  const [card, setCard] = createSignal<HTMLElement>();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

  createEffect(card, (element) => {
    if (!element) {
      return;
    }

    try {
      element.showPopover?.();
    } catch {
      // Already shown, or popovers unsupported: it then lies in place, as in jsdom.
    }

    place(element, props.anchor);
    (element.querySelector<HTMLElement>('[data-autofocus]') ?? element).focus({ preventScroll: true });
    return () => {
      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  });

  // Native listeners on the card itself, so every key stops here, before the document's and the window's listeners
  // (Solid's delegated handlers among them, so the content handles its keys through `onKey`). A key's default
  // action, such as Enter pressing the focused button, stays unless the card or its content used the key.
  createEventListener(card, 'keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
    } else if (props.onKey?.(event)) {
      event.preventDefault();
    }
  });
  createEventListener(card, 'keyup', (event) => event.stopPropagation());
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const element = card();
      if (element && !(event.target instanceof Node && element.contains(event.target))) {
        props.onCancel();
      }
    },
    { capture: true }
  );

  return (
    <div
      ref={setCard}
      class={styles.entryCard}
      popover="manual"
      role="dialog"
      aria-label={props.label}
      tabindex="-1"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.children}
    </div>
  );
}

/** Places `card` under `anchor`, or over it where there is no room below, right edges aligned, inside the window. */
function place(card: HTMLElement, anchor: Element) {
  const rect = anchor.getBoundingClientRect();
  const { width, height } = card.getBoundingClientRect();
  const margin = 8;
  const below = rect.bottom + margin;
  const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - margin - height);
  const left = Math.max(margin, Math.min(window.innerWidth - margin - width, rect.right - width));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

/**
 * A keypad for typing a value, as Procreate shows when its value is tapped, without the system's on-screen keyboard:
 * the value being typed with its unit and the allowed range, digits, a decimal point only when `step` is fractional,
 * a sign only when `min` is negative, backspace, − and + that nudge the value by one step, Cancel and OK. The first
 * digit replaces the value shown; backspace then edits what was typed.
 *
 * A hardware keyboard works too: digits, the point (or a comma), minus, Backspace, the arrow keys up and down to
 * nudge, Enter for OK. OK calls `onCommit` once with the typed value clamped to `min`…`max` and snapped to `step`;
 * nothing is sent before it.
 */
export function NumberKeypad(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** The value's step, 1 by default; a fractional one offers the decimal point. */
  step?: number;
  /** The value's unit as it follows a number, such as "%" or " marks". */
  unit: string;
  onCommit: (value: number) => void;
  onCancel: () => void;
  /** Receives the keypad's key handler, for the card that holds the keyboard. */
  keys?: (handler: (event: KeyboardEvent) => boolean) => void;
}) {
  const step = () => props.step ?? 1;
  const decimal = () => !Number.isInteger(step());
  const signed = () => props.min < 0;
  const [draft, setDraft] = createSignal(String(props.value));
  /** Whether the value shown is still the one the keypad opened with, which the first digit replaces. */
  const [fresh, setFresh] = createSignal(true);
  const typed = createMemo(() => parseDraft(draft()));
  const settle = (value: number) => settleValue(value, { min: props.min, max: props.max, step: step() });

  const press = (key: KeypadKey) => {
    if (key === 'nudge-down' || key === 'nudge-up') {
      const from = typed() ?? props.value;
      setDraft(String(settle(from + (key === 'nudge-up' ? step() : -step()))));
      setFresh(false);
      return;
    }

    setDraft(editDraft(fresh() ? '' : draft(), key, { decimal: decimal(), signed: signed() }));
    setFresh(false);
  };
  const commit = () => {
    const value = typed();
    if (value !== undefined) {
      props.onCommit(settle(value));
    }
  };

  props.keys?.((event) => {
    const key = keyOf(event.key);
    if (event.key === 'Enter') {
      commit();
      return true;
    }

    if (!key || (key === '.' && !decimal()) || (key === 'sign' && !signed())) {
      return false;
    }

    press(key);
    return true;
  });

  const zeroSpan = () => 4 - (decimal() ? 1 : 0) - (signed() ? 1 : 0);

  return (
    <div class={styles.keypad}>
      <div class={styles.keypadHead}>
        <span>{props.label}</span>
        <span>
          {formatNumber(props.min)}–{formatNumber(props.max)}
          {props.unit}
        </span>
      </div>
      <output class={styles.keypadValue} data-fresh={fresh() ? '' : undefined} aria-live="polite">
        <span>{draft() || '0'}</span>
        <Show when={props.unit}>
          <small>{props.unit}</small>
        </Show>
      </output>
      <div class={styles.keypadKeys}>
        <For each={['7', '8', '9'] as const}>{(digit) => <Key key={digit} onPress={press} />}</For>
        <Key key="backspace" onPress={press} label="Delete last digit">
          ⌫
        </Key>
        <For each={['4', '5', '6'] as const}>{(digit) => <Key key={digit} onPress={press} />}</For>
        <Key key="nudge-down" onPress={press} label={`Decrease by ${formatNumber(step())}`}>
          −
        </Key>
        <For each={['1', '2', '3'] as const}>{(digit) => <Key key={digit} onPress={press} />}</For>
        <Key key="nudge-up" onPress={press} label={`Increase by ${formatNumber(step())}`}>
          +
        </Key>
        <Show when={signed()}>
          <Key key="sign" onPress={press} label="Change sign">
            ±
          </Key>
        </Show>
        <Key key="0" onPress={press} style={{ 'grid-column': `span ${zeroSpan()}` }} />
        <Show when={decimal()}>
          <Key key="." onPress={press} label="Decimal point" />
        </Show>
      </div>
      <div class={styles.keypadActions}>
        <button type="button" onClick={() => props.onCancel()}>
          Cancel
        </button>
        <button type="button" data-ok disabled={typed() === undefined} data-autofocus onClick={commit}>
          OK
        </button>
      </div>
    </div>
  );
}

/** A key of the keypad: digits show themselves; others show their children and are named by `label`. */
function Key(props: {
  key: KeypadKey;
  onPress: (key: KeypadKey) => void;
  label?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      data-key={props.key}
      style={props.style}
      // A key acts on the press, as a calculator's does; the focus stays on the card.
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => props.onPress(props.key)}
    >
      {props.children ?? props.key}
    </button>
  );
}

/** A key of the keypad: a digit, the decimal point, the sign, backspace or a nudge by one step. */
export type KeypadKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'sign' | 'backspace' | 'nudge-down' | 'nudge-up';

/** The keypad key a hardware key stands for, if any. */
function keyOf(key: string): KeypadKey | undefined {
  if (/^[0-9]$/.test(key)) {
    return key as KeypadKey;
  }

  return (
    { '.': '.', ',': '.', '-': 'sign', Backspace: 'backspace', ArrowDown: 'nudge-down', ArrowUp: 'nudge-up' } as const
  )[key as never];
}

/**
 * `draft` after pressing `key` (a digit, the point, the sign or backspace): a second point is ignored, as is a point
 * or a sign the value does not take; a leading zero gives way to the next digit; backspace removes the last character.
 */
export function editDraft(draft: string, key: KeypadKey, takes: { decimal: boolean; signed: boolean }) {
  if (key === 'backspace') {
    const shorter = draft.slice(0, -1);
    return shorter === '-' ? '' : shorter;
  }

  if (key === 'sign') {
    return !takes.signed ? draft : draft.startsWith('-') ? draft.slice(1) : `-${draft}`;
  }

  if (key === '.') {
    if (!takes.decimal || draft.includes('.')) {
      return draft;
    }

    return `${draft.replace(/^-?$/, (sign) => `${sign}0`)}.`;
  }

  if (key === 'nudge-down' || key === 'nudge-up') {
    return draft;
  }

  // At most 9 digits: a value beyond any range a setting has.
  if (draft.replace(/[^0-9]/g, '').length >= 9) {
    return draft;
  }

  return /^-?0$/.test(draft) ? draft.replace(/0$/, key) : draft + key;
}

/** The number `draft` reads as, or none while it reads as no number, as when empty or only a sign. */
export function parseDraft(draft: string) {
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(draft)) {
    return undefined;
  }

  return Number(draft);
}

/**
 * `value` snapped to the nearest multiple of `step` (counted from zero, as the brush settings round) and clamped to
 * `min`…`max`, without binary noise such as 0.30000000000000004.
 */
export function settleValue(value: number, range: { min: number; max: number; step: number }) {
  const decimals = (String(range.step).split('.')[1] ?? '').length;
  const snapped = Number((Math.round(value / range.step) * range.step).toFixed(decimals));
  return Math.min(range.max, Math.max(range.min, snapped));
}

/** A range bound as the keypad shows it: at most three decimals, without trailing zeros. */
function formatNumber(value: number) {
  return String(Number(value.toFixed(3)));
}

/**
 * The named levels of a value, such as Smoothing's 0 to 22, as a small grid with the current one highlighted: a tap
 * chooses a level and calls `onChoose` once. Levels of one zone share a row run; a new zone starts a new row under a
 * quiet line. Enter or Space chooses the focused level; `moveLevelFocus` gives the arrow keys.
 */
export function LevelPicker(props: {
  label: string;
  levels: readonly ValueLevel[];
  /** The current value; the level of this value is highlighted. */
  value: number;
  onChoose: (value: number) => void;
}) {
  const zones = createMemo(() => {
    const runs: { zone: string | undefined; levels: ValueLevel[] }[] = [];
    for (const level of props.levels) {
      const last = runs.at(-1);
      if (last && last.zone === level.zone) {
        last.levels.push(level);
      } else {
        runs.push({ zone: level.zone, levels: [level] });
      }
    }

    return runs;
  });

  return (
    <div class={styles.levelPicker} role="listbox" aria-label={props.label}>
      <div class={styles.keypadHead}>
        <span>{props.label}</span>
      </div>
      <For each={zones()}>
        {(run) => (
          <div class={styles.levelZone} data-zone={run.zone}>
            <For each={run.levels}>
              {(level) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={level.value === props.value ? 'true' : 'false'}
                  data-autofocus={level.value === props.value ? '' : undefined}
                  onClick={() => props.onChoose(level.value)}
                >
                  {level.label}
                </button>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

/** A named level of a value, such as Smoothing's "18"; see `ValueChannel`'s `levels`. */
export type ValueLevel = {
  value: number;
  label: string;
  /** The zone the level lies in; the slider and the picker mark where one zone ends and the next begins. */
  zone?: string;
};

/**
 * The level picker's arrow keys, for its card's `onKey`: left and right move the focus to the previous or next level.
 * Returns whether the key was used.
 */
export function moveLevelFocus(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return false;
  }

  const target = event.target as HTMLElement;
  const buttons = [...(target.closest('[role="listbox"]')?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
  const index = buttons.indexOf(target);
  buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))]?.focus();
  return true;
}

/**
 * `unit` as it follows a number: a word, such as "marks", after a no-break space ("80 marks"); a symbol or an
 * abbreviation of up to two letters, such as %, ° or px, right after it ("80%").
 */
export function unitSuffix(unit: string) {
  return /^\p{L}{3,}/u.test(unit) ? `\u00a0${unit}` : unit;
}
