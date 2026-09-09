import type { PaintSession } from './createPaintSession';

/** Mouse, pen, and keyboard users share the same undoable selection commands. */
export function SelectionActions(props: { session: PaintSession }) {
  const selection = props.session.selection;
  const unavailable = () => !props.session.ready() || selection.busy() || selection.drawing();
  const empty = () => unavailable() || selection.points().length < 3;
  return (
    <div class="paint-selection-actions" aria-label="Selection actions">
      <span role="status">
        {selection.busy()
          ? 'Applying selection…'
          : selection.points().length >= 3
            ? 'Drag inside to move. Pixels move on release.'
            : 'Draw around pixels on the active layer.'}
      </span>
      <div>
        <button disabled={empty()} onClick={() => selection.action('copy')} title="Copy · ⌘/Ctrl C">
          Copy
        </button>
        <button disabled={empty()} onClick={() => selection.action('cut')} title="Cut · ⌘/Ctrl X">
          Cut
        </button>
        <button
          disabled={unavailable() || !selection.hasClipboard()}
          onClick={() => selection.action('paste')}
          title="Paste into active layer · ⌘/Ctrl V"
        >
          Paste
        </button>
        <button disabled={empty()} onClick={() => selection.action('new-layer')}>
          Move to new layer
        </button>
        <button disabled={empty()} onClick={() => selection.action('delete')} title="Delete selected pixels">
          Delete
        </button>
        <button disabled={empty()} onClick={() => selection.clear()} title="Deselect · Escape">
          Deselect
        </button>
      </div>
    </div>
  );
}
