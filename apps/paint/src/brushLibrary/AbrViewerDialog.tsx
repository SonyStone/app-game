import { createEffect, lazy, onCleanup } from 'solid-js';
import type { PaintSession } from '../createPaintSession';
import { SketchIcon } from '../SketchIcon';
import styles from './AbrViewerDialog.module.css';

const Viewer = lazy(() => import('@app-game/abr-viewer/editor').then((module) => ({ default: module.App })));

/** Keeps the actual viewer mounted between visits so its library and edits survive closing the modal. */
export function AbrViewerDialog(props: {
  open: boolean;
  close: () => void;
  session: Pick<PaintSession, 'useAbrBrush' | 'brush' | 'updateBrush'>;
}) {
  let dialog!: HTMLDialogElement;
  createEffect(
    () => props.open,
    (open) => {
      if (open && !dialog.open) dialog.showModal();
      else if (!open && dialog.open) dialog.close();
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
        if (!dialog.open && props.open) props.close();
      }}
    >
      <header class={styles.abrTitle}>
        <strong>ABR Brush · experimental</strong>
        <button aria-label="Close ABR editor" onClick={props.close}>
          <SketchIcon name="close" />
        </button>
      </header>
      <Viewer
        colorMixing={{
          get value() {
            return props.session.brush().mixing;
          },
          onChange: (mixing) => props.session.updateBrush({ mixing })
        }}
        useBrushNote="Paint uses this preset’s tip, dynamics, texture and dual brush. Physical tips, wet edges, height modes and Mixer Brush mixing are approximations; Photoshop parity is not yet verified."
        onUseBrush={async (brush) => {
          await props.session.useAbrBrush(brush);
          props.close();
        }}
      />
    </dialog>
  );
}
