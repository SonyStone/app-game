import { makeEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, onMount, Show, type JSX } from 'solid-js';

// ============================================================================
// Types
// ============================================================================

type KeyState = {
  pressed: boolean;
};

type MouseButtonState = {
  left: boolean;
  middle: boolean;
  right: boolean;
};

type KeyboardLayout = 'ANSI' | 'ISO';

// ============================================================================
//  MARK: Main Component
// ============================================================================

export default function InputVisualizer(): JSX.Element {
  const [pressedKeys, setPressedKeys] = createSignal<Set<string>>(new Set());
  const [mouseButtons, setMouseButtons] = createSignal<MouseButtonState>({
    left: false,
    middle: false,
    right: false
  });
  const [lastEvent, setLastEvent] = createSignal<string>('');
  const [lastShortcut, setLastShortcut] = createSignal<string>('');
  const [layout, setLayout] = createSignal<KeyboardLayout>('ANSI');

  // Compute current shortcut from pressed keys
  const currentShortcut = createMemo(() => {
    const keys = pressedKeys();
    if (keys.size === 0) return '';
    return formatShortcut(keys);
  });

  onMount(() => {
    makeEventListener(window, 'keydown', (e: KeyboardEvent) => {
      e.preventDefault();
      const key = normalizeKey(e.code);
      setPressedKeys((prev) => {
        const next = new Set([...prev, key]);
        // Update last shortcut when we have at least one key
        if (next.size > 0) {
          setLastShortcut(formatShortcut(next));
        }
        return next;
      });
      setLastEvent(`↓ ${e.code} (key: "${e.key}")`);
    });

    makeEventListener(window, 'keyup', (e: KeyboardEvent) => {
      e.preventDefault();
      const key = normalizeKey(e.code);
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setLastEvent(`↑ ${e.code} (key: "${e.key}")`);
    });

    makeEventListener(window, 'mousedown', (e: MouseEvent) => {
      setMouseButtons((prev) => ({
        ...prev,
        left: e.button === 0 ? true : prev.left,
        middle: e.button === 1 ? true : prev.middle,
        right: e.button === 2 ? true : prev.right
      }));
      setLastEvent(`↓ Mouse ${getMouseButtonName(e.button)}`);
    });

    makeEventListener(window, 'mouseup', (e: MouseEvent) => {
      setMouseButtons((prev) => ({
        ...prev,
        left: e.button === 0 ? false : prev.left,
        middle: e.button === 1 ? false : prev.middle,
        right: e.button === 2 ? false : prev.right
      }));
      setLastEvent(`↑ Mouse ${getMouseButtonName(e.button)}`);
    });

    makeEventListener(window, 'contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });
  });

  return (
    <div class="flex min-h-screen select-none flex-col gap-6 bg-neutral-900 p-6 text-white">
      <header class="text-center">
        <h1 class="text-2xl font-bold">Input Visualizer</h1>
        <p class="text-neutral-400">Press any key or mouse button to see it highlighted</p>
      </header>

      <div class="flex flex-wrap justify-center gap-4">
        <div class="rounded-lg bg-neutral-800 p-4 text-center">
          <span class="text-neutral-400">Last event: </span>
          <span class="font-mono text-green-400">{lastEvent() || 'None'}</span>
        </div>
        <div class="rounded-lg bg-neutral-800 p-4 text-center">
          <span class="text-neutral-400">Current shortcut: </span>
          <span class="font-mono text-yellow-400">{currentShortcut() || 'None'}</span>
        </div>
        <div class="rounded-lg bg-neutral-800 p-4 text-center">
          <span class="text-neutral-400">Last shortcut: </span>
          <span class="font-mono text-cyan-400">{lastShortcut() || 'None'}</span>
        </div>
      </div>

      <section class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Mouse Buttons</h2>
        <MouseButtonsDisplay mouseButtons={mouseButtons()} />
      </section>

      <section class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Keyboard</h2>
          <LayoutToggle layout={layout()} setLayout={setLayout} />
        </div>
        <KeyboardDisplay pressedKeys={pressedKeys()} layout={layout()} />
      </section>
    </div>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function MouseButtonsDisplay(props: { mouseButtons: MouseButtonState }): JSX.Element {
  return (
    <div class="flex items-center justify-center gap-8">
      <div class="flex flex-col items-center gap-2">
        <div class="flex gap-1">
          <MouseButton label="Left" pressed={props.mouseButtons.left} class="rounded-l-xl" />
          <MouseButton label="Middle" pressed={props.mouseButtons.middle} class="h-12" />
          <MouseButton label="Right" pressed={props.mouseButtons.right} class="rounded-r-xl" />
        </div>
        <div class="h-16 w-24 rounded-b-3xl bg-neutral-700" />
      </div>
    </div>
  );
}

function MouseButton(props: { label: string; pressed: boolean; class?: string }): JSX.Element {
  return (
    <div
      class={`flex h-20 w-12 items-center justify-center rounded-t-lg border-2 text-xs font-medium transition-all ${
        props.pressed
          ? 'border-green-400 bg-green-500/30 text-green-300'
          : 'border-neutral-600 bg-neutral-700 text-neutral-400'
      } ${props.class ?? ''}`}
    >
      {props.label}
    </div>
  );
}

function LayoutToggle(props: { layout: KeyboardLayout; setLayout: (layout: KeyboardLayout) => void }): JSX.Element {
  return (
    <div class="flex items-center gap-2 rounded-lg bg-neutral-800 p-1">
      <button
        class={`rounded px-3 py-1 text-sm font-medium transition-all ${
          props.layout === 'ANSI' ? 'bg-blue-500 text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
        onClick={() => props.setLayout('ANSI')}
      >
        ANSI
      </button>
      <button
        class={`rounded px-3 py-1 text-sm font-medium transition-all ${
          props.layout === 'ISO' ? 'bg-blue-500 text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
        onClick={() => props.setLayout('ISO')}
      >
        ISO
      </button>
    </div>
  );
}

function KeyboardDisplay(props: { pressedKeys: Set<string>; layout: KeyboardLayout }): JSX.Element {
  const isISO = () => props.layout === 'ISO';

  return (
    <div class="flex flex-col items-center gap-1 overflow-x-auto p-4">
      {/* Function row */}
      <div class="flex gap-1">
        <Key code="Escape" label="Esc" pressed={props.pressedKeys} width="w-12" />
        <div class="w-8" />
        <For each={['F1', 'F2', 'F3', 'F4']}>{(key) => <Key code={key} label={key} pressed={props.pressedKeys} />}</For>
        <div class="w-4" />
        <For each={['F5', 'F6', 'F7', 'F8']}>{(key) => <Key code={key} label={key} pressed={props.pressedKeys} />}</For>
        <div class="w-4" />
        <For each={['F9', 'F10', 'F11', 'F12']}>
          {(key) => <Key code={key} label={key} pressed={props.pressedKeys} />}
        </For>
      </div>

      <div class="h-2" />

      {/* Number row */}
      <div class="flex gap-1">
        <Key code="Backquote" label="`" pressed={props.pressedKeys} />
        <For each={['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']}>
          {(key) => <Key code={`Digit${key}`} label={key} pressed={props.pressedKeys} />}
        </For>
        <Key code="Minus" label="-" pressed={props.pressedKeys} />
        <Key code="Equal" label="=" pressed={props.pressedKeys} />
        <Key code="Backspace" label="⌫" pressed={props.pressedKeys} width="w-16" />
      </div>

      {/* QWERTY row - ANSI has backslash here, ISO doesn't */}
      <div class="flex gap-1">
        <Key code="Tab" label="Tab" pressed={props.pressedKeys} width="w-14" />
        <For each={['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']}>
          {(key) => <Key code={`Key${key}`} label={key} pressed={props.pressedKeys} />}
        </For>
        <Key code="BracketLeft" label="[" pressed={props.pressedKeys} />
        <Key code="BracketRight" label="]" pressed={props.pressedKeys} />
        <Show when={!isISO()}>
          <Key code="Backslash" label="\" pressed={props.pressedKeys} width="w-14" />
        </Show>
        <Show when={isISO()}>
          {/* ISO Enter top part - this is visual only, the actual Enter key spans two rows */}
          <div class="w-3" />
        </Show>
      </div>

      {/* ASDF row - ISO has backslash here and different Enter */}
      <div class="flex gap-1">
        <Key code="CapsLock" label="Caps" pressed={props.pressedKeys} width="w-16" />
        <For each={['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']}>
          {(key) => <Key code={`Key${key}`} label={key} pressed={props.pressedKeys} />}
        </For>
        <Key code="Semicolon" label=";" pressed={props.pressedKeys} />
        <Key code="Quote" label="'" pressed={props.pressedKeys} />
        <Show when={isISO()}>
          <Key code="Backslash" label="\" pressed={props.pressedKeys} />
        </Show>
        <Key code="Enter" label="Enter" pressed={props.pressedKeys} width={isISO() ? 'w-14' : 'w-18'} />
      </div>

      {/* ZXCV row - ISO has extra key (IntlBackslash) next to left shift */}
      <div class="flex gap-1">
        <Key code="ShiftLeft" label="Shift" pressed={props.pressedKeys} width={isISO() ? 'w-10' : 'w-20'} />
        <Show when={isISO()}>
          <Key code="IntlBackslash" label="\" pressed={props.pressedKeys} />
        </Show>
        <For each={['Z', 'X', 'C', 'V', 'B', 'N', 'M']}>
          {(key) => <Key code={`Key${key}`} label={key} pressed={props.pressedKeys} />}
        </For>
        <Key code="Comma" label="," pressed={props.pressedKeys} />
        <Key code="Period" label="." pressed={props.pressedKeys} />
        <Key code="Slash" label="/" pressed={props.pressedKeys} />
        <Key code="ShiftRight" label="Shift" pressed={props.pressedKeys} width="w-20" />
      </div>

      {/* Bottom row */}
      <div class="flex gap-1">
        <Key code="ControlLeft" label="Ctrl" pressed={props.pressedKeys} width="w-14" />
        <Key code="MetaLeft" label="Win" pressed={props.pressedKeys} width="w-12" />
        <Key code="AltLeft" label="Alt" pressed={props.pressedKeys} width="w-12" />
        <Key code="Space" label="Space" pressed={props.pressedKeys} width="w-64" />
        <Key code="AltRight" label="Alt" pressed={props.pressedKeys} width="w-12" />
        <Key code="MetaRight" label="Win" pressed={props.pressedKeys} width="w-12" />
        <Key code="ContextMenu" label="Menu" pressed={props.pressedKeys} width="w-12" />
        <Key code="ControlRight" label="Ctrl" pressed={props.pressedKeys} width="w-14" />
      </div>

      <div class="h-4" />

      {/* Navigation cluster */}
      <div class="flex gap-8">
        <div class="flex flex-col gap-1">
          <div class="flex gap-1">
            <Key code="Insert" label="Ins" pressed={props.pressedKeys} />
            <Key code="Home" label="Home" pressed={props.pressedKeys} />
            <Key code="PageUp" label="PgUp" pressed={props.pressedKeys} />
          </div>
          <div class="flex gap-1">
            <Key code="Delete" label="Del" pressed={props.pressedKeys} />
            <Key code="End" label="End" pressed={props.pressedKeys} />
            <Key code="PageDown" label="PgDn" pressed={props.pressedKeys} />
          </div>
        </div>

        {/* Arrow keys */}
        <div class="flex flex-col items-center gap-1">
          <Key code="ArrowUp" label="↑" pressed={props.pressedKeys} />
          <div class="flex gap-1">
            <Key code="ArrowLeft" label="←" pressed={props.pressedKeys} />
            <Key code="ArrowDown" label="↓" pressed={props.pressedKeys} />
            <Key code="ArrowRight" label="→" pressed={props.pressedKeys} />
          </div>
        </div>

        {/* Numpad */}
        <div class="flex gap-1">
          {/* Main numpad grid */}
          <div class="flex flex-col gap-1">
            <div class="flex gap-1">
              <Key code="NumLock" label="Num" pressed={props.pressedKeys} />
              <Key code="NumpadDivide" label="/" pressed={props.pressedKeys} />
              <Key code="NumpadMultiply" label="*" pressed={props.pressedKeys} />
            </div>
            <div class="flex gap-1">
              <Key code="Numpad7" label="7" pressed={props.pressedKeys} />
              <Key code="Numpad8" label="8" pressed={props.pressedKeys} />
              <Key code="Numpad9" label="9" pressed={props.pressedKeys} />
            </div>
            <div class="flex gap-1">
              <Key code="Numpad4" label="4" pressed={props.pressedKeys} />
              <Key code="Numpad5" label="5" pressed={props.pressedKeys} />
              <Key code="Numpad6" label="6" pressed={props.pressedKeys} />
            </div>
            <div class="flex gap-1">
              <Key code="Numpad1" label="1" pressed={props.pressedKeys} />
              <Key code="Numpad2" label="2" pressed={props.pressedKeys} />
              <Key code="Numpad3" label="3" pressed={props.pressedKeys} />
            </div>
            <div class="flex gap-1">
              <Key code="Numpad0" label="0" pressed={props.pressedKeys} width="w-19" />
              <Key code="NumpadDecimal" label="." pressed={props.pressedKeys} />
            </div>
          </div>
          {/* Right column with tall keys */}
          <div class="flex flex-col gap-1">
            <Key code="NumpadSubtract" label="-" pressed={props.pressedKeys} />
            <Key code="NumpadAdd" label="+" pressed={props.pressedKeys} height="h-19" />
            <Key code="NumpadEnter" label="⏎" pressed={props.pressedKeys} height="h-19" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Key(props: {
  code: string;
  label: string;
  pressed: Set<string>;
  width?: string;
  height?: string;
}): JSX.Element {
  const isPressed = () => props.pressed.has(props.code);

  return (
    <div
      class={`flex items-center justify-center rounded border-2 font-mono text-xs font-medium transition-all ${
        props.width ?? 'w-9'
      } ${props.height ?? 'h-9'} ${
        isPressed()
          ? 'scale-95 border-green-400 bg-green-500/30 text-green-300'
          : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
      }`}
    >
      {props.label}
    </div>
  );
}

// ============================================================================
// MARK: Helper Functions
// ============================================================================

function normalizeKey(code: string): string {
  return code;
}

function formatShortcut(keys: Set<string>): string {
  const keyArray = Array.from(keys);

  // Define modifier priority order
  const modifierOrder = [
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'ShiftLeft',
    'ShiftRight',
    'MetaLeft',
    'MetaRight'
  ];

  // Separate modifiers and regular keys
  const modifiers: string[] = [];
  const regularKeys: string[] = [];

  for (const key of keyArray) {
    if (modifierOrder.includes(key)) {
      modifiers.push(key);
    } else {
      regularKeys.push(key);
    }
  }

  // Sort modifiers by priority
  modifiers.sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));

  // Convert to display names
  const displayParts = [...modifiers.map(getKeyDisplayName), ...regularKeys.map(getKeyDisplayName)];

  // Remove duplicate modifier names (e.g., ControlLeft and ControlRight both become "Ctrl")
  const uniqueParts: string[] = [];
  for (const part of displayParts) {
    if (!uniqueParts.includes(part)) {
      uniqueParts.push(part);
    }
  }

  return uniqueParts.join(' + ');
}

function getKeyDisplayName(code: string): string {
  const displayNames: Record<string, string> = {
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    MetaLeft: 'Win',
    MetaRight: 'Win',
    Space: 'Space',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Escape: 'Esc',
    CapsLock: 'CapsLock',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Insert: 'Insert',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    NumLock: 'NumLock',
    NumpadEnter: 'NumEnter',
    NumpadAdd: 'Num+',
    NumpadSubtract: 'Num-',
    NumpadMultiply: 'Num*',
    NumpadDivide: 'Num/',
    NumpadDecimal: 'Num.',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    IntlBackslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    ContextMenu: 'Menu'
  };

  if (displayNames[code]) {
    return displayNames[code];
  }

  // Handle letter keys (KeyA -> A)
  if (code.startsWith('Key')) {
    return code.slice(3);
  }

  // Handle digit keys (Digit1 -> 1)
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }

  // Handle function keys (F1 -> F1)
  if (code.startsWith('F') && /^F\d+$/.test(code)) {
    return code;
  }

  // Handle numpad keys (Numpad1 -> Num1)
  if (code.startsWith('Numpad')) {
    return 'Num' + code.slice(6);
  }

  return code;
}

function getMouseButtonName(button: number): string {
  switch (button) {
    case 0:
      return 'Left';
    case 1:
      return 'Middle';
    case 2:
      return 'Right';
    case 3:
      return 'Back';
    case 4:
      return 'Forward';
    default:
      return `Button ${button}`;
  }
}
