import { editable } from '@app-game/paint-core/input';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import { createEventListener } from '@solid-primitives/event-listener';
import type { PaintTool } from '../brush';

/**
 * Editor keyboard shortcuts on `window`. Escape closes an open panel, even from its own controls, and then does nothing
 * else; only an Escape with no panel open cancels work in progress. Shortcuts, including that cancel, are ignored in
 * open dialogs and text or form fields. Single-key tool and brush shortcuts ignore presses with Ctrl, Cmd or Alt and
 * IME composition. Letters and brackets typed on non-Latin layouts match by physical key. Ctrl or Cmd with `=`/`+`,
 * `-` and `0` zoom the canvas instead of the page. Must be created within a Solid owner, which removes the listener on
 * disposal.
 */
export function createPaintShortcuts(actions: {
  /** Closes the open side panel, if any; returns whether one was open. */
  closePanel: () => boolean;
  tool: () => PaintTool;
  chooseTool: (tool: PaintTool) => void;
  /** Runs a selection command; only used while a tool working with the selection is active. */
  selectionAction: (action: SelectionAction) => void;
  deselect: () => void;
  selectAll: () => void;
  invertSelection: () => void;
  /** Chooses the magic wand. */
  chooseWand: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  swapColors: () => void;
  resetColors: () => void;
  scaleBrush: (factor: number) => void;
  /** Zooms the canvas around the viewport center by `factor`. */
  zoomBy: (factor: number) => void;
  resetZoom: () => void;
  /** Starts transforming the selection or the active layer, or applies the transform in progress. */
  transform: () => void;
  /**
   * Applies the work in progress that Enter confirms, such as a transform or a polygon selection; returns whether
   * there was any.
   */
  confirm: () => boolean;
  /** Cancels the stroke, Mixer Brush pick, puck, outline and transform in progress. */
  cancel: () => void;
}) {
  createEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape' && actions.closePanel()) {
      return;
    }

    if ((event.target instanceof Element && event.target.closest('dialog[open]')) || editable(event.target)) {
      return;
    }

    // Enter on a focused button or link presses it instead.
    if (
      event.key === 'Enter' &&
      event.target instanceof Element &&
      event.target.closest('button, a, [role="button"]')
    ) {
      return;
    }

    const shortcut = match(event, selectionTools.has(actions.tool()));
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

/** One shortcut: whether it matches the key press, and its command. */
type Shortcut = { when: boolean; preventDefault?: boolean; run: (actions: ShortcutActions) => void };

/** Finds the shortcut for a key press, in priority order; `lasso` enables the selection commands. */
function match(event: KeyboardEvent, lasso: boolean) {
  const modifier = event.ctrlKey || event.metaKey;
  const key = shortcutKey(event);
  const plain = !modifier && !event.altKey && !event.isComposing;
  const shortcuts: Shortcut[] = [
    {
      when: modifier && lasso && (key === 'c' || key === 'x' || key === 'v'),
      preventDefault: true,
      run: (actions) => actions.selectionAction(key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste')
    },
    { when: modifier && key === 'd', preventDefault: true, run: (actions) => actions.deselect() },
    {
      when: modifier && !event.shiftKey && key === 'a',
      preventDefault: true,
      run: (actions) => actions.selectAll()
    },
    {
      when: modifier && event.shiftKey && key === 'i',
      preventDefault: true,
      run: (actions) => actions.invertSelection()
    },
    { when: modifier && key === 't', preventDefault: true, run: (actions) => actions.transform() },
    { when: event.key === 'Enter', run: (actions) => actions.confirm() },
    {
      when: lasso && (key === 'delete' || key === 'backspace'),
      preventDefault: true,
      run: (actions) => actions.selectionAction('delete')
    },
    {
      when: modifier && !event.altKey && !event.isComposing && key === 'z',
      preventDefault: true,
      run: (actions) => (event.shiftKey ? actions.redo() : actions.undo())
    },
    { when: modifier && !event.shiftKey && key === 'y', preventDefault: true, run: (actions) => actions.redo() },
    { when: modifier && key === 's', preventDefault: true, run: (actions) => actions.save() },
    { when: modifier && (key === '=' || key === '+'), preventDefault: true, run: (actions) => actions.zoomBy(1.25) },
    { when: modifier && key === '-', preventDefault: true, run: (actions) => actions.zoomBy(0.8) },
    { when: modifier && key === '0', preventDefault: true, run: (actions) => actions.resetZoom() },
    { when: plain && key === 'b', run: (actions) => actions.chooseTool('brush') },
    { when: plain && key === 'e', run: (actions) => actions.chooseTool('eraser') },
    { when: plain && key === 'l', run: (actions) => actions.chooseTool('lasso') },
    { when: plain && key === 'g', run: (actions) => actions.chooseTool('fill') },
    { when: plain && key === 'w', run: (actions) => actions.chooseWand() },
    { when: plain && !event.repeat && key === 'x', run: (actions) => actions.swapColors() },
    { when: plain && key === 'd', run: (actions) => actions.resetColors() },
    { when: event.key === 'Escape', run: (actions) => actions.cancel() },
    { when: plain && key === '[', run: (actions) => actions.scaleBrush(0.8) },
    { when: plain && key === ']', run: (actions) => actions.scaleBrush(1.25) }
  ];
  return shortcuts.find((shortcut) => shortcut.when);
}

/**
 * The lower-case key a shortcut matches. A letter or bracket typed on a non-Latin layout (`я` on the Z key) falls back
 * to the physical key, so shortcuts keep working; Latin layouts such as AZERTY or Dvorak keep the typed letter.
 */
function shortcutKey(event: KeyboardEvent) {
  const typed = event.key.toLowerCase();
  if (typed.length !== 1 || /[a-z[\]]/.test(typed)) {
    return typed;
  }

  return physicalKeys[event.code] ?? (/^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : typed);
}

/** Tools showing the selection actions, whose shortcuts they enable. */
const selectionTools = new Set<PaintTool>(['lasso', 'fill', 'gradient']);

const physicalKeys: Record<string, string> = { BracketLeft: '[', BracketRight: ']' };
