import { pathCommandLetters } from '../../path-data';
import type { ShortcutBinding, ShortcutItem } from '../../editor/types';
import type { Accessor } from 'solid-js';

export interface ShortcutDescriptor extends ShortcutItem {
  readonly id: string;
  /** Current bindings: the user's edits, else the defaults. Read when a key is pressed. */
  readonly bindings: readonly ShortcutBinding[];
  readonly defaultBindings: readonly ShortcutBinding[];
  /** False for multi-key families such as the path command letters, which are not rebound. */
  readonly editable: boolean;
  readonly allowInEditable?: boolean;
  /**
   * Performs the action; `event` is the key press, or `undefined` when a button runs it. Returning `false` means the
   * action did not apply, and the key press is left to the browser.
   */
  readonly run: (event: KeyboardEvent | undefined) => boolean | void;
}

/**
 * Matches keydown events against shortcut descriptors and runs the first match.
 *
 * While `enabled` returns false (a dialog is open, a drag is in progress) no shortcut runs. In text fields only
 * descriptors with `allowInEditable` run, so typing and the field's own undo keep working.
 */
export function createShortcutRegistry(
  descriptors: readonly ShortcutDescriptor[],
  options: { readonly activeElement?: Accessor<Element | null>; readonly enabled?: Accessor<boolean> } = {}
) {
  function onKeyDown(event: KeyboardEvent): void {
    // Disabled, or already handled (a popover closing on Escape).
    if ((options.enabled && !options.enabled()) || event.defaultPrevented) {
      return;
    }

    const target = event.target ?? options.activeElement?.();
    const editing = isEditableTarget(target);
    const usable = descriptors.filter((item) => !editing || item.allowInEditable === true);
    // The typed key wins; the physical key covers Alt on macOS and non-Latin layouts (Ctrl+Я is Ctrl+Z).
    const descriptor =
      usable.find((item) => item.bindings.some((binding) => matchesBinding(event, binding, event.key))) ??
      usable.find((item) => item.bindings.some((binding) => matchesBinding(event, binding, keyFromCode(event))));

    if (!descriptor) {
      return;
    }

    if (descriptor.run(event) !== false) {
      event.preventDefault();
    }
  }

  return { onKeyDown };
}

export function pathCommandBindings(): readonly ShortcutBinding[] {
  return pathCommandLetters.flatMap((letter) => [{ key: letter }, { key: letter, shift: true }]);
}

function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding, key: string | undefined): boolean {
  if (key === undefined || !sameKey(key, binding.key)) {
    return false;
  }

  if ((event.ctrlKey || event.metaKey) !== (binding.ctrl ?? false)) {
    return false;
  }

  if (event.shiftKey !== (binding.shift ?? false)) {
    return false;
  }

  return event.altKey === (binding.alt ?? false);
}

function sameKey(actual: string, expected: string): boolean {
  if (expected.length === 1) {
    return actual.toLowerCase() === expected.toLowerCase();
  }

  return actual === expected;
}

function isEditableTarget(target: EventTarget | Element | null | undefined): boolean {
  if (!isMatchableTarget(target)) {
    return false;
  }

  return target.matches("input, textarea, select, [contenteditable='true']");
}

function isMatchableTarget(target: unknown): target is { matches: (selector: string) => boolean } {
  return typeof target === 'object' && target !== null && 'matches' in target && typeof target.matches === 'function';
}

/** Writes a binding as text, such as `Ctrl+Shift+Z`. */
export function formatBinding(binding: ShortcutBinding): string {
  const key = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
  return [binding.ctrl && 'Ctrl', binding.shift && 'Shift', binding.alt && 'Alt', key].filter(Boolean).join('+');
}

/** The binding a key press describes, or `undefined` for a lone modifier key. */
export function bindingFromEvent(event: KeyboardEvent): ShortcutBinding | undefined {
  if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
    return undefined;
  }

  // With Alt, macOS types a symbol (Alt+S gives "ß"); the physical key is what the user means.
  const key = (event.altKey ? keyFromCode(event) : undefined) ?? event.key;

  return {
    key: key.length === 1 ? key.toLowerCase() : key,
    ...(event.ctrlKey || event.metaKey ? { ctrl: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.altKey ? { alt: true } : {})
  };
}

/** The letter or digit of the physical key (`KeyS` → `s`), or `undefined` for other keys. */
function keyFromCode(event: KeyboardEvent): string | undefined {
  const match = /^(?:Key([A-Z])|Digit(\d))$/.exec(event.code ?? '');
  return match ? (match[1] ?? match[2] ?? '').toLowerCase() : undefined;
}

/** Whether two bindings describe the same key press. */
export function sameBinding(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    sameKey(a.key, b.key) && Boolean(a.ctrl) === Boolean(b.ctrl) && Boolean(a.shift) === Boolean(b.shift) && Boolean(a.alt) === Boolean(b.alt)
  );
}
