import { editable } from '@app-game/paint-core/input';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import { createEventListener } from '@solid-primitives/event-listener';
import type { PaintTool } from '../brush';

/**
 * Editor keyboard shortcuts on `window`. Escape closes an open panel, even from its own controls; shortcuts, including
 * Escape's cancel, are ignored in open dialogs and text or form fields. `event.code` also matches Z on non-Latin
 * layouts. Must be created within a Solid owner, which removes the listener on disposal.
 */
export function createPaintShortcuts(actions: {
  /** Closes the open side panel, if any. */
  closePanel: () => void;
  tool: () => PaintTool;
  chooseTool: (tool: PaintTool) => void;
  /** Runs a lasso command; only used while the lasso is active. */
  selectionAction: (action: SelectionAction) => void;
  deselect: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  swapColors: () => void;
  resetColors: () => void;
  scaleBrush: (factor: number) => void;
  /** Cancels the stroke, Mixer Brush pick, puck and outline in progress. */
  cancel: () => void;
}) {
  createEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape') {
      actions.closePanel();
    }

    if ((event.target instanceof Element && event.target.closest('dialog[open]')) || editable(event.target)) {
      return;
    }

    const shortcut = match(event, actions.tool() === 'lasso');
    if (!shortcut) {
      return;
    }

    if (shortcut.preventDefault) {
      event.preventDefault();
    }

    shortcut.run(actions);
  });
}

type ShortcutActions = Parameters<typeof createPaintShortcuts>[0];

/** Finds the shortcut for a key press, in priority order. */
function match(event: KeyboardEvent, lasso: boolean) {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const plain = !modifier && !event.altKey && !event.isComposing;
  const shortcuts: Shortcut[] = [
    {
      when: modifier && lasso && (key === 'c' || key === 'x' || key === 'v'),
      preventDefault: true,
      run: (actions) => actions.selectionAction(key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste')
    },
    { when: modifier && key === 'd', preventDefault: true, run: (actions) => actions.deselect() },
    {
      when: lasso && (key === 'delete' || key === 'backspace'),
      preventDefault: true,
      run: (actions) => actions.selectionAction('delete')
    },
    {
      when: modifier && !event.altKey && !event.isComposing && (key === 'z' || event.code === 'KeyZ'),
      preventDefault: true,
      run: (actions) => (event.shiftKey ? actions.redo() : actions.undo())
    },
    { when: modifier && key === 's', preventDefault: true, run: (actions) => actions.save() },
    { when: !modifier && key === 'b', run: (actions) => actions.chooseTool('brush') },
    { when: !modifier && key === 'e', run: (actions) => actions.chooseTool('eraser') },
    { when: !modifier && key === 'l', run: (actions) => actions.chooseTool('lasso') },
    { when: plain && !event.repeat && key === 'x', run: (actions) => actions.swapColors() },
    { when: plain && key === 'd', run: (actions) => actions.resetColors() },
    { when: event.key === 'Escape', run: (actions) => actions.cancel() },
    { when: event.key === '[', run: (actions) => actions.scaleBrush(0.8) },
    { when: event.key === ']', run: (actions) => actions.scaleBrush(1.25) }
  ];
  return shortcuts.find((shortcut) => shortcut.when);
}

/** One shortcut: whether it matches the key press, and its command. */
type Shortcut = { when: boolean; preventDefault?: boolean; run: (actions: ShortcutActions) => void };
