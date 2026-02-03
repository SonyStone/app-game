import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, onMount, Show, type Accessor, type JSX, type Setter } from 'solid-js';

// ============================================================================
// MARK: Types
// ============================================================================

type Action = {
  id: string;
  name: string;
  category: string;
  shortcut: string | null;
};

type ActionCategory = {
  name: string;
  actions: Action[];
};

// ============================================================================
// MARK: Constants
// ============================================================================

const DEFAULT_ACTIONS: Action[] = [
  // Edit
  { id: 'undo', name: 'Undo', category: 'Edit', shortcut: 'Ctrl + Z' },
  { id: 'redo', name: 'Redo', category: 'Edit', shortcut: 'Ctrl + Shift + Z' },
  { id: 'cut', name: 'Cut', category: 'Edit', shortcut: 'Ctrl + X' },
  { id: 'copy', name: 'Copy', category: 'Edit', shortcut: 'Ctrl + C' },
  { id: 'paste', name: 'Paste', category: 'Edit', shortcut: 'Ctrl + V' },
  { id: 'delete', name: 'Delete', category: 'Edit', shortcut: 'Delete' },
  { id: 'select-all', name: 'Select All', category: 'Edit', shortcut: 'Ctrl + A' },
  { id: 'deselect', name: 'Deselect', category: 'Edit', shortcut: 'Ctrl + D' },

  // View
  { id: 'zoom-in', name: 'Zoom In', category: 'View', shortcut: 'Ctrl + =' },
  { id: 'zoom-out', name: 'Zoom Out', category: 'View', shortcut: 'Ctrl + -' },
  { id: 'zoom-fit', name: 'Zoom to Fit', category: 'View', shortcut: 'Ctrl + 0' },
  { id: 'zoom-100', name: 'Zoom to 100%', category: 'View', shortcut: 'Ctrl + 1' },
  { id: 'pan', name: 'Pan Canvas', category: 'View', shortcut: 'Space' },
  { id: 'fullscreen', name: 'Toggle Fullscreen', category: 'View', shortcut: 'F11' },
  { id: 'toggle-grid', name: 'Toggle Grid', category: 'View', shortcut: "Ctrl + '" },
  { id: 'toggle-rulers', name: 'Toggle Rulers', category: 'View', shortcut: 'Ctrl + R' },

  // Transform
  { id: 'rotate-cw', name: 'Rotate Clockwise', category: 'Transform', shortcut: 'Ctrl + ]' },
  { id: 'rotate-ccw', name: 'Rotate Counter-Clockwise', category: 'Transform', shortcut: 'Ctrl + [' },
  { id: 'flip-h', name: 'Flip Horizontal', category: 'Transform', shortcut: 'Ctrl + Shift + H' },
  { id: 'flip-v', name: 'Flip Vertical', category: 'Transform', shortcut: 'Ctrl + Shift + V' },
  { id: 'free-transform', name: 'Free Transform', category: 'Transform', shortcut: 'Ctrl + T' },

  // Tools
  { id: 'tool-brush', name: 'Brush Tool', category: 'Tools', shortcut: 'B' },
  { id: 'tool-eraser', name: 'Eraser Tool', category: 'Tools', shortcut: 'E' },
  { id: 'tool-move', name: 'Move Tool', category: 'Tools', shortcut: 'V' },
  { id: 'tool-selection', name: 'Selection Tool', category: 'Tools', shortcut: 'M' },
  { id: 'tool-lasso', name: 'Lasso Tool', category: 'Tools', shortcut: 'L' },
  { id: 'tool-pen', name: 'Pen Tool', category: 'Tools', shortcut: 'P' },
  { id: 'tool-text', name: 'Text Tool', category: 'Tools', shortcut: 'T' },
  { id: 'tool-eyedropper', name: 'Eyedropper Tool', category: 'Tools', shortcut: 'I' },
  { id: 'tool-fill', name: 'Fill Tool', category: 'Tools', shortcut: 'G' },
  { id: 'tool-hand', name: 'Hand Tool', category: 'Tools', shortcut: 'H' },
  { id: 'tool-zoom', name: 'Zoom Tool', category: 'Tools', shortcut: 'Z' },

  // Layers
  { id: 'new-layer', name: 'New Layer', category: 'Layers', shortcut: 'Ctrl + Shift + N' },
  { id: 'duplicate-layer', name: 'Duplicate Layer', category: 'Layers', shortcut: 'Ctrl + J' },
  { id: 'merge-down', name: 'Merge Down', category: 'Layers', shortcut: 'Ctrl + E' },
  { id: 'merge-visible', name: 'Merge Visible', category: 'Layers', shortcut: 'Ctrl + Shift + E' },
  { id: 'flatten-image', name: 'Flatten Image', category: 'Layers', shortcut: null },
  { id: 'layer-up', name: 'Move Layer Up', category: 'Layers', shortcut: 'Ctrl + ]' },
  { id: 'layer-down', name: 'Move Layer Down', category: 'Layers', shortcut: 'Ctrl + [' },

  // File
  { id: 'new-file', name: 'New', category: 'File', shortcut: 'Ctrl + N' },
  { id: 'open-file', name: 'Open', category: 'File', shortcut: 'Ctrl + O' },
  { id: 'save', name: 'Save', category: 'File', shortcut: 'Ctrl + S' },
  { id: 'save-as', name: 'Save As', category: 'File', shortcut: 'Ctrl + Shift + S' },
  { id: 'export', name: 'Export', category: 'File', shortcut: 'Ctrl + Shift + E' },
  { id: 'close', name: 'Close', category: 'File', shortcut: 'Ctrl + W' }
];

// ============================================================================
// MARK: Main Component
// ============================================================================

export default function ShortcutSettings(): JSX.Element {
  const [actions, setActions] = createSignal<Action[]>(DEFAULT_ACTIONS);
  const [editingActionId, setEditingActionId] = createSignal<string | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(
    new Set(['Edit', 'View', 'Transform', 'Tools', 'Layers', 'File'])
  );

  // Group actions by category
  const categorizedActions = (): ActionCategory[] => {
    const filtered = actions().filter(
      (action) =>
        action.name.toLowerCase().includes(searchQuery().toLowerCase()) ||
        action.shortcut?.toLowerCase().includes(searchQuery().toLowerCase())
    );

    const categories = new Map<string, Action[]>();
    for (const action of filtered) {
      const list = categories.get(action.category) || [];
      list.push(action);
      categories.set(action.category, list);
    }

    return Array.from(categories.entries()).map(([name, actions]) => ({ name, actions }));
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const updateShortcut = (actionId: string, shortcut: string | null) => {
    setActions((prev) => prev.map((action) => (action.id === actionId ? { ...action, shortcut } : action)));
    setEditingActionId(null);
  };

  const clearShortcut = (actionId: string) => {
    updateShortcut(actionId, null);
  };

  const resetAllShortcuts = () => {
    setActions(DEFAULT_ACTIONS);
  };

  return (
    <div class="flex min-h-screen select-none flex-col bg-neutral-900 text-white">
      {/* Header */}
      <header class="flex items-center justify-between border-b border-neutral-700 p-4">
        <h1 class="text-xl font-bold">Shortcut Settings</h1>
        <button
          class="rounded bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-600"
          onClick={resetAllShortcuts}
        >
          Reset All
        </button>
      </header>

      {/* Search */}
      <div class="border-b border-neutral-700 p-4">
        <input
          type="text"
          placeholder="Search actions or shortcuts..."
          class="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500"
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
        />
      </div>

      {/* Actions List */}
      <div class="flex-1 overflow-y-auto p-4">
        <For each={categorizedActions()}>
          {(category) => (
            <CategorySection
              category={category}
              expanded={expandedCategories().has(category.name)}
              onToggle={() => toggleCategory(category.name)}
              editingActionId={editingActionId}
              setEditingActionId={setEditingActionId}
              updateShortcut={updateShortcut}
              clearShortcut={clearShortcut}
            />
          )}
        </For>
      </div>

      {/* Editing overlay */}
      <Show when={editingActionId()}>
        <ShortcutCaptureOverlay
          actionId={editingActionId()!}
          actionName={actions().find((a) => a.id === editingActionId())?.name ?? ''}
          onCapture={(shortcut) => updateShortcut(editingActionId()!, shortcut)}
          onCancel={() => setEditingActionId(null)}
        />
      </Show>
    </div>
  );
}

// ============================================================================
// MARK: Sub-Components
// ============================================================================

function CategorySection(props: {
  category: ActionCategory;
  expanded: boolean;
  onToggle: () => void;
  editingActionId: Accessor<string | null>;
  setEditingActionId: Setter<string | null>;
  updateShortcut: (actionId: string, shortcut: string | null) => void;
  clearShortcut: (actionId: string) => void;
}): JSX.Element {
  return (
    <div class="mb-2">
      <button
        class="hover:bg-neutral-750 flex w-full items-center gap-2 rounded-lg bg-neutral-800 px-4 py-3 text-left font-medium transition-colors"
        onClick={props.onToggle}
      >
        <span
          class={`text-neutral-400 transition-transform ${props.expanded ? 'rotate-90' : ''}`}
          style={{ 'font-size': '10px' }}
        >
          ▶
        </span>
        <span class="text-blue-400">{props.category.name}</span>
        <span class="text-sm text-neutral-500">({props.category.actions.length})</span>
      </button>
      <Show when={props.expanded}>
        <div class="ml-2 mt-1 border-l border-neutral-700 pl-2">
          <For each={props.category.actions}>
            {(action) => (
              <ActionRow
                action={action}
                isEditing={props.editingActionId() === action.id}
                onEdit={() => props.setEditingActionId(action.id)}
                onClear={() => props.clearShortcut(action.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ActionRow(props: {
  action: Action;
  isEditing: boolean;
  onEdit: () => void;
  onClear: () => void;
}): JSX.Element {
  return (
    <div class="flex items-center justify-between rounded px-3 py-2 transition-colors hover:bg-neutral-800/50">
      <span class="text-sm text-neutral-300">{props.action.name}</span>
      <div class="flex items-center gap-2">
        <button
          class={`min-w-32 rounded border px-3 py-1.5 text-center font-mono text-xs transition-all ${
            props.isEditing
              ? 'border-blue-500 bg-blue-500/20 text-blue-300'
              : props.action.shortcut
                ? 'border-neutral-600 bg-neutral-700 text-neutral-300 hover:border-neutral-500'
                : 'border-dashed border-neutral-600 text-neutral-500 hover:border-neutral-500 hover:text-neutral-400'
          }`}
          onClick={props.onEdit}
        >
          {props.isEditing ? 'Press keys...' : props.action.shortcut || '...'}
        </button>
        <button
          class="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            props.onClear();
          }}
          title="Clear shortcut"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ShortcutCaptureOverlay(props: {
  actionId: string;
  actionName: string;
  onCapture: (shortcut: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [pressedKeys, setPressedKeys] = createSignal<Set<string>>(new Set());
  const [capturedShortcut, setCapturedShortcut] = createSignal<string>('');

  onMount(() => {
    makeEventListener(window, 'keydown', (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        props.onCancel();
        return;
      }

      const key = e.code;
      setPressedKeys((prev) => {
        const next = new Set([...prev, key]);
        const shortcut = formatShortcut(next);
        setCapturedShortcut(shortcut);
        return next;
      });
    });

    makeEventListener(window, 'keyup', (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // When keys are released, save the captured shortcut
      const currentShortcut = capturedShortcut();
      if (currentShortcut && pressedKeys().size > 0) {
        // Small delay to ensure we capture the full combo
        setTimeout(() => {
          if (capturedShortcut()) {
            props.onCapture(capturedShortcut());
          }
        }, 100);
      }

      const key = e.code;
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  });

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={props.onCancel}>
      <div
        class="flex flex-col items-center gap-6 rounded-xl bg-neutral-800 p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="text-center">
          <h2 class="text-lg font-semibold text-white">Set Shortcut</h2>
          <p class="mt-1 text-sm text-neutral-400">
            for <span class="text-blue-400">{props.actionName}</span>
          </p>
        </div>

        <div class="flex min-h-16 min-w-64 items-center justify-center rounded-lg border-2 border-dashed border-neutral-600 bg-neutral-900 px-6 py-4">
          <span class={`font-mono text-xl ${capturedShortcut() ? 'text-green-400' : 'text-neutral-500'}`}>
            {capturedShortcut() || 'Press keys...'}
          </span>
        </div>

        <div class="flex gap-3">
          <button
            class="rounded-lg bg-neutral-700 px-6 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-600"
            onClick={props.onCancel}
          >
            Cancel (Esc)
          </button>
          <Show when={capturedShortcut()}>
            <button
              class="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              onClick={() => props.onCapture(capturedShortcut())}
            >
              Save
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MARK: Helper Functions
// ============================================================================

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

  // Remove duplicate modifier names
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
