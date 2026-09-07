import { createEffect, lazy, onCleanup } from 'solid-js';
import type { PaintSession } from '../createPaintSession';
import { SketchIcon } from '../SketchIcon';

const Viewer = lazy(() => import('@app-game/abr-viewer/editor').then((module) => ({ default: module.App })));

/** Keeps the actual viewer mounted between visits so its library and edits survive closing the modal. */
export function AbrViewerDialog(props: {
  open: boolean;
  close: () => void;
  session: Pick<PaintSession, 'useAbrBrush'>;
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
      class="paint-abr-viewer"
      aria-label="ABR brush editor"
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
      onClose={() => {
        if (!dialog.open && props.open) props.close();
      }}
    >
      <header class="paint-abr-title">
        <strong>ABR Brush · experimental</strong>
        <button aria-label="Close ABR editor" onClick={props.close}>
          <SketchIcon name="close" />
        </button>
      </header>
      <Viewer
        useBrushNote="Paint uses this preset’s tip, dynamics, texture and dual brush. Physical tips, wet edges and height modes are approximations; Photoshop parity is not yet verified."
        onUseBrush={async (brush) => {
          await props.session.useAbrBrush(brush);
          props.close();
        }}
      />
    </dialog>
  );
}
