import { makeEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, onMount, type JSX } from 'solid-js';
import { formatShortcut, KeyboardDisplay, LayoutToggle, type KeyboardLayout } from './keyboard-display';

// ============================================================================
// Types
// ============================================================================

type MouseButtonState = {
  left: boolean;
  middle: boolean;
  right: boolean;
};

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
      const key = e.code;
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
      const key = e.code;
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

// ============================================================================
// MARK: Helper Functions
// ============================================================================

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
