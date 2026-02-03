import { For, Show, type JSX } from 'solid-js';

// ============================================================================
// Types
// ============================================================================

export type KeyboardLayout = 'ANSI' | 'ISO';

export type KeyboardDisplayProps = {
  pressedKeys: Set<string>;
  layout: KeyboardLayout;
  onKeyClick?: (code: string) => void;
  interactive?: boolean;
};

// ============================================================================
// Main Component
// ============================================================================

export function KeyboardDisplay(props: KeyboardDisplayProps): JSX.Element {
  const isISO = () => props.layout === 'ISO';

  return (
    <div class="flex flex-col items-center gap-1 overflow-x-auto p-4">
      {/* Function row */}
      <div class="flex gap-1">
        <Key
          code="Escape"
          label="Esc"
          pressed={props.pressedKeys}
          width="w-12"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <div class="w-8" />
        <For each={['F1', 'F2', 'F3', 'F4']}>
          {(key) => (
            <Key
              code={key}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
        <div class="w-4" />
        <For each={['F5', 'F6', 'F7', 'F8']}>
          {(key) => (
            <Key
              code={key}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
        <div class="w-4" />
        <For each={['F9', 'F10', 'F11', 'F12']}>
          {(key) => (
            <Key
              code={key}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
      </div>

      <div class="h-2" />

      {/* Number row */}
      <div class="flex gap-1">
        <Key
          code="Backquote"
          label="`"
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <For each={['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']}>
          {(key) => (
            <Key
              code={`Digit${key}`}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
        <Key
          code="Minus"
          label="-"
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="Equal"
          label="="
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="Backspace"
          label="⌫"
          pressed={props.pressedKeys}
          width="w-16"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
      </div>

      {/* QWERTY row - ANSI has backslash here, ISO doesn't */}
      <div class="flex gap-1">
        <Key
          code="Tab"
          label="Tab"
          pressed={props.pressedKeys}
          width="w-14"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <For each={['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']}>
          {(key) => (
            <Key
              code={`Key${key}`}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
        <Key
          code="BracketLeft"
          label="["
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="BracketRight"
          label="]"
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Show when={!isISO()}>
          <Key
            code="Backslash"
            label="\"
            pressed={props.pressedKeys}
            width="w-14"
            onKeyClick={props.onKeyClick}
            interactive={props.interactive}
          />
        </Show>
        <Show when={isISO()}>
          {/* ISO Enter top part - this is visual only, the actual Enter key spans two rows */}
          <div class="w-3" />
        </Show>
      </div>

      {/* ASDF row - ISO has backslash here and different Enter */}
      <div class="flex gap-1">
        <Key
          code="CapsLock"
          label="Caps"
          pressed={props.pressedKeys}
          width="w-16"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <For each={['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']}>
          {(key) => (
            <Key
              code={`Key${key}`}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
        <Key
          code="Semicolon"
          label=";"
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="Quote"
          label="'"
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Show when={isISO()}>
          <Key
            code="Backslash"
            label="\"
            pressed={props.pressedKeys}
            onKeyClick={props.onKeyClick}
            interactive={props.interactive}
          />
        </Show>
        <Key
          code="Enter"
          label="Enter"
          pressed={props.pressedKeys}
          width={isISO() ? 'w-14' : 'w-18'}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
      </div>

      {/* ZXCV row - ISO has extra key (IntlBackslash) next to left shift */}
      <div class="flex gap-1">
        <Key
          code="ShiftLeft"
          label="Shift"
          pressed={props.pressedKeys}
          width={isISO() ? 'w-10' : 'w-20'}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Show when={isISO()}>
          <Key
            code="IntlBackslash"
            label="\"
            pressed={props.pressedKeys}
            onKeyClick={props.onKeyClick}
            interactive={props.interactive}
          />
        </Show>
        <For each={['Z', 'X', 'C', 'V', 'B', 'N', 'M']}>
          {(key) => (
            <Key
              code={`Key${key}`}
              label={key}
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          )}
        </For>
        <Key
          code="Comma"
          label=","
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="Period"
          label="."
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="Slash"
          label="/"
          pressed={props.pressedKeys}
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="ShiftRight"
          label="Shift"
          pressed={props.pressedKeys}
          width="w-20"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
      </div>

      {/* Bottom row */}
      <div class="flex gap-1">
        <Key
          code="ControlLeft"
          label="Ctrl"
          pressed={props.pressedKeys}
          width="w-14"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="MetaLeft"
          label="Win"
          pressed={props.pressedKeys}
          width="w-12"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="AltLeft"
          label="Alt"
          pressed={props.pressedKeys}
          width="w-12"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="Space"
          label="Space"
          pressed={props.pressedKeys}
          width="w-64"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="AltRight"
          label="Alt"
          pressed={props.pressedKeys}
          width="w-12"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="MetaRight"
          label="Win"
          pressed={props.pressedKeys}
          width="w-12"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="ContextMenu"
          label="Menu"
          pressed={props.pressedKeys}
          width="w-12"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
        <Key
          code="ControlRight"
          label="Ctrl"
          pressed={props.pressedKeys}
          width="w-14"
          onKeyClick={props.onKeyClick}
          interactive={props.interactive}
        />
      </div>

      <div class="h-4" />

      {/* Navigation cluster */}
      <div class="flex gap-8">
        <div class="flex flex-col gap-1">
          <div class="flex gap-1">
            <Key
              code="Insert"
              label="Ins"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="Home"
              label="Home"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="PageUp"
              label="PgUp"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          </div>
          <div class="flex gap-1">
            <Key
              code="Delete"
              label="Del"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="End"
              label="End"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="PageDown"
              label="PgDn"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          </div>
        </div>

        {/* Arrow keys */}
        <div class="flex flex-col items-center gap-1">
          <Key
            code="ArrowUp"
            label="↑"
            pressed={props.pressedKeys}
            onKeyClick={props.onKeyClick}
            interactive={props.interactive}
          />
          <div class="flex gap-1">
            <Key
              code="ArrowLeft"
              label="←"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="ArrowDown"
              label="↓"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="ArrowRight"
              label="→"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          </div>
        </div>

        {/* Numpad */}
        <div class="flex gap-1">
          {/* Main numpad grid */}
          <div class="flex flex-col gap-1">
            <div class="flex gap-1">
              <Key
                code="NumLock"
                label="Num"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="NumpadDivide"
                label="/"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="NumpadMultiply"
                label="*"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
            </div>
            <div class="flex gap-1">
              <Key
                code="Numpad7"
                label="7"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="Numpad8"
                label="8"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="Numpad9"
                label="9"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
            </div>
            <div class="flex gap-1">
              <Key
                code="Numpad4"
                label="4"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="Numpad5"
                label="5"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="Numpad6"
                label="6"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
            </div>
            <div class="flex gap-1">
              <Key
                code="Numpad1"
                label="1"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="Numpad2"
                label="2"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="Numpad3"
                label="3"
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
            </div>
            <div class="flex gap-1">
              <Key
                code="Numpad0"
                label="0"
                pressed={props.pressedKeys}
                width="w-19"
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
              <Key
                code="NumpadDecimal"
                label="."
                pressed={props.pressedKeys}
                onKeyClick={props.onKeyClick}
                interactive={props.interactive}
              />
            </div>
          </div>
          {/* Right column with tall keys */}
          <div class="flex flex-col gap-1">
            <Key
              code="NumpadSubtract"
              label="-"
              pressed={props.pressedKeys}
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="NumpadAdd"
              label="+"
              pressed={props.pressedKeys}
              height="h-19"
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
            <Key
              code="NumpadEnter"
              label="⏎"
              pressed={props.pressedKeys}
              height="h-19"
              onKeyClick={props.onKeyClick}
              interactive={props.interactive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

export function LayoutToggle(props: {
  layout: KeyboardLayout;
  setLayout: (layout: KeyboardLayout) => void;
}): JSX.Element {
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

function Key(props: {
  code: string;
  label: string;
  pressed: Set<string>;
  width?: string;
  height?: string;
  onKeyClick?: (code: string) => void;
  interactive?: boolean;
}): JSX.Element {
  const isPressed = () => props.pressed.has(props.code);

  const handleClick = () => {
    if (props.interactive && props.onKeyClick) {
      props.onKeyClick(props.code);
    }
  };

  return (
    <div
      class={`flex items-center justify-center rounded border-2 font-mono text-xs font-medium transition-all ${
        props.width ?? 'w-9'
      } ${props.height ?? 'h-9'} ${
        isPressed()
          ? 'scale-95 border-green-400 bg-green-500/30 text-green-300'
          : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
      } ${props.interactive ? 'cursor-pointer active:scale-95' : ''}`}
      onClick={handleClick}
    >
      {props.label}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

export function formatShortcut(keys: Set<string>): string {
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

export function getKeyDisplayName(code: string): string {
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
