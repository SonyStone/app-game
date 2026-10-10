// Keyboard shortcuts of the Desktop variant written as strings such as `Mod+Shift+N`: `Mod` is Cmd on Apple devices
// and Ctrl elsewhere, then `Shift` and `Alt`, then one key. Letters and digits match by physical key, so they work on
// any keyboard layout; other keys (`Tab`, `F1`, `/`, `?`, `Backspace`) match the typed key.

/** Whether a key press is the shortcut `keys`; `apple` tells whether `Mod` means Cmd. */
export function matchesKeys(event: KeyEventLike, keys: string, apple: boolean) {
  const { mod, shift, alt, key } = parseKeys(keys);
  const command = apple ? event.metaKey : event.ctrlKey;
  const other = apple ? event.ctrlKey : event.metaKey;
  // `?` is typed with Shift on most layouts, so Shift is not part of it.
  const shiftMatches = key === '?' || event.shiftKey === shift;
  if (command !== mod || other || event.altKey !== alt || !shiftMatches) {
    return false;
  }

  if (/^[A-Z]$/.test(key)) {
    return event.code === `Key${key}`;
  }

  if (/^[0-9]$/.test(key)) {
    return event.code === `Digit${key}` || event.code === `Numpad${key}`;
  }

  return event.key === key || (key === '/' && event.code === 'Slash' && !shift);
}

/** The key press fields {@link matchesKeys} reads. */
export type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Shortcut `keys` as menus show it: `⌘⇧N` on Apple devices, `Ctrl+Shift+N` elsewhere. */
export function formatKeys(keys: string, apple: boolean) {
  const { mod, shift, alt, key } = parseKeys(keys);
  const shown = keyNames[key] ?? key;
  if (apple) {
    return `${alt ? '⌥' : ''}${shift ? '⇧' : ''}${mod ? '⌘' : ''}${shown}`;
  }

  return [mod && 'Ctrl', alt && 'Alt', shift && 'Shift', shown].filter(Boolean).join('+');
}

/** Whether `Mod` means Cmd: Macs, and iPads that report themselves as Macs. */
export function isApple() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** Splits shortcut `keys` into modifiers and the key, upper-cased when it is a letter. */
function parseKeys(keys: string) {
  const parts = keys.split('+');
  // A shortcut on the plus key itself ends in an empty part.
  const key = keys.endsWith('++') ? '+' : (parts.at(-1) ?? '');
  const modifiers = new Set(parts.slice(0, -1));
  return {
    mod: modifiers.has('Mod'),
    shift: modifiers.has('Shift'),
    alt: modifiers.has('Alt'),
    key: key.length === 1 ? key.toUpperCase() : key
  };
}

const keyNames: Record<string, string> = { Backspace: '⌫', Delete: 'Del', Escape: 'Esc', '=': '+' };
