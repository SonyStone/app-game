import type { BrushAsset } from '@app-game/abr-brush/library';
import type { Brush } from '@app-game/paint-core/brush';
import type { Result } from 'neverthrow';
import { createEffect, lazy, onCleanup } from 'solid-js';
import type { PaintError } from '../../shared/errors';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './AbrViewerDialog.module.css';

const Viewer = lazy(() => import('@app-game/abr-viewer/editor').then((module) => ({ default: module.App })));

/**
 * Modal ABR viewer for importing, editing and choosing ABR presets. Keep it mounted between visits: closing only hides
 * the dialog, so the viewer's library and edits survive.
 */
export function AbrViewerDialog(props: {
  open: boolean;
  /** Requests closing, from the close button, Escape or after a preset was applied. */
  close: () => void;
  /** Color mixing of the active brush, edited alongside the preset. */
  mixing: Brush['mixing'];
  onMixingChange: (mixing: Brush['mixing']) => void;
  /** Applies a preset; the dialog closes on success and the viewer shows the error message on failure. */
  onUseBrush: (brush: BrushAsset) => Promise<Result<void, PaintError>>;
}) {
  let dialog!: HTMLDialogElement;
  createEffect(
    () => props.open,
    (open) => {
      if (open && !dialog.open) {
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    }
  );
  onCleanup(() => dialog.close());

  return (
    <dialog
      ref={dialog}
      class={styles.abrViewer}
      aria-label="ABR brush editor"
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
      onClose={() => {
        if (!dialog.open && props.open) {
          props.close();
        }
      }}
    >
      <header class={styles.abrTitle}>
        <strong>ABR Brush · experimental</strong>
        <button aria-label="Close ABR editor" onClick={() => props.close()}>
          <SketchIcon name="close" />
        </button>
      </header>
      <Viewer
        colorMixing={{
          get value() {
            return props.mixing;
          },
          onChange: (mixing) => props.onMixingChange(mixing)
        }}
        useBrushNote="Paint uses this preset’s tip, dynamics, texture and dual brush. Physical tips, wet edges, height modes and Mixer Brush mixing are approximations; Photoshop parity is not yet verified."
        onUseBrush={async (brush) => {
          // The viewer reports a thrown error as its status message.
          const used = await props.onUseBrush(brush);
          if (used.isErr()) {
            throw new Error(used.error.message, { cause: used.error });
          }

          props.close();
        }}
      />
    </dialog>
  );
}
