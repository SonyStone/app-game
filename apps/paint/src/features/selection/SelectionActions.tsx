import type { Point, ViewSize } from '@app-game/paint-core/camera';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import { For, Show } from 'solid-js';
import { FloatingBar, FloatingBarSeparator } from '../../shared/ui/FloatingBar';
import { placeBeside } from '../../shared/ui/placeBeside';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import type { SelectionShape } from './createSelection';

/**
 * Selection commands as an icon bar next to the selection: the shape of the next outline (lasso, rectangle, ellipse),
 * the fill and gradient tools, which work only inside a selection, filling the whole selection with the color, then
 * transform, copy, cut, paste, move to a new layer, delete and deselect. Without a selection, a hint at the top of the
 * canvas with the shapes, and Paste when pixels were copied. Keyboard shortcuts run the same undoable commands.
 */
export function SelectionActions(props: {
  /** The outline in CSS pixels of the canvas; fewer than three points means nothing is selected. */
  outline: readonly Point[];
  /** Size of the canvas in CSS pixels. */
  size: ViewSize;
  /** Commands are unavailable, for example before the engine is ready or during a lasso gesture. */
  disabled: boolean;
  /** A selection edit is applying. */
  busy: boolean;
  /** Copied pixels are available to paste. */
  hasClipboard: boolean;
  onAction: (action: SelectionAction) => void;
  onTransform: () => void;
  onDeselect: () => void;
  /** The shape the next outline is drawn with. */
  shape: SelectionShape;
  onShape: (shape: SelectionShape) => void;
  /** The tool working in the selection: drawing outlines (`lasso`), the bucket fill or the gradient. */
  tool: 'lasso' | 'fill' | 'gradient';
  onTool: (tool: 'lasso' | 'fill' | 'gradient') => void;
  /** Fills the whole selection with the color, as one undo step. */
  onFillSelection: () => void;
}) {
  const selected = () => props.outline.length >= 3;
  const unavailable = () => props.disabled || props.busy;
  const paste = () => (
    <button
      aria-label="Paste"
      title="Paste into the active layer · ⌘/Ctrl V"
      disabled={unavailable() || !props.hasClipboard}
      onClick={() => props.onAction('paste')}
    >
      <SketchIcon name="paste" size={20} />
    </button>
  );

  const shapes = () => (
    <For each={shapeButtons}>
      {(item) => (
        <button
          aria-label={item.label}
          title={item.title}
          aria-pressed={props.tool === 'lasso' && props.shape === item.shape ? 'true' : 'false'}
          onClick={() => {
            props.onShape(item.shape);
            props.onTool('lasso');
          }}
        >
          <SketchIcon name={item.icon} size={20} />
        </button>
      )}
    </For>
  );

  return (
    <Show
      when={selected()}
      fallback={
        <FloatingBar placement={{ left: props.size.width / 2, top: hintTop }} label="Selection actions">
          {shapes()}
          <span role="status">
            {props.busy
              ? 'Applying selection…'
              : props.shape === 'lasso'
                ? 'Draw around pixels to select them.'
                : 'Drag across pixels to select them.'}
          </span>
          <Show when={props.hasClipboard}>{paste()}</Show>
        </FloatingBar>
      }
    >
      <FloatingBar placement={placeBeside(props.outline, props.size, barSize)} label="Selection actions">
        {shapes()}
        <FloatingBarSeparator />
        <button
          aria-label="Fill tool"
          title="Fill · G: click inside the selection to fill an area of similar color"
          aria-pressed={props.tool === 'fill' ? 'true' : 'false'}
          disabled={unavailable()}
          onClick={() => props.onTool(props.tool === 'fill' ? 'lasso' : 'fill')}
        >
          <SketchIcon name="fill" size={20} />
        </button>
        <button
          aria-label="Gradient tool"
          title="Gradient: drag inside the selection from where it starts to where it ends"
          aria-pressed={props.tool === 'gradient' ? 'true' : 'false'}
          disabled={unavailable()}
          onClick={() => props.onTool(props.tool === 'gradient' ? 'lasso' : 'gradient')}
        >
          <SketchIcon name="gradient" size={20} />
        </button>
        <button
          aria-label="Fill selection"
          title="Fill the whole selection with the color"
          disabled={unavailable()}
          onClick={() => props.onFillSelection()}
        >
          <SketchIcon name="fillSelection" size={20} />
        </button>
        <FloatingBarSeparator />
        <button
          aria-label="Transform selection"
          title="Transform the selected pixels · ⌘/Ctrl T"
          disabled={unavailable()}
          onClick={() => props.onTransform()}
        >
          <SketchIcon name="move" size={20} />
        </button>
        <FloatingBarSeparator />
        <button
          aria-label="Copy"
          title="Copy · ⌘/Ctrl C"
          disabled={unavailable()}
          onClick={() => props.onAction('copy')}
        >
          <SketchIcon name="copy" size={20} />
        </button>
        <button aria-label="Cut" title="Cut · ⌘/Ctrl X" disabled={unavailable()} onClick={() => props.onAction('cut')}>
          <SketchIcon name="cut" size={20} />
        </button>
        {paste()}
        <button
          aria-label="Move to new layer"
          title="Move the selected pixels to a new layer"
          disabled={unavailable()}
          onClick={() => props.onAction('new-layer')}
        >
          <SketchIcon name="newLayer" size={20} />
        </button>
        <button
          aria-label="Delete"
          title="Delete the selected pixels · Delete"
          disabled={unavailable()}
          onClick={() => props.onAction('delete')}
        >
          <SketchIcon name="trash" size={20} />
        </button>
        <FloatingBarSeparator />
        <button
          aria-label="Deselect"
          title="Deselect · Escape"
          disabled={unavailable()}
          onClick={() => props.onDeselect()}
        >
          <SketchIcon name="close" size={20} />
        </button>
      </FloatingBar>
    </Show>
  );
}

/** Top of the hint bar, below the view controls. */
const hintTop = 66;

/** Approximate size of the bar, for placing it. */
const barSize = { width: 560, height: 48 };

/** The shapes an outline is drawn with, in bar order. */
const shapeButtons: readonly { shape: SelectionShape; label: string; title: string; icon: SketchIconName }[] = [
  { shape: 'lasso', label: 'Lasso selection', title: 'Lasso · L: draw around the pixels', icon: 'lasso' },
  { shape: 'rectangle', label: 'Rectangle selection', title: 'Rectangle: drag across the pixels', icon: 'selectRect' },
  { shape: 'ellipse', label: 'Ellipse selection', title: 'Ellipse: drag across the pixels', icon: 'selectEllipse' }
];
