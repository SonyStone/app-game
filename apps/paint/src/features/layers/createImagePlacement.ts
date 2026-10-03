import type { Point, ViewSize } from '@app-game/paint-core/camera';
import { editable } from '@app-game/paint-core/input';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createNativeDroppable } from '@solid-primitives/drag-drop';
import { createEventListener } from '@solid-primitives/event-listener';

/**
 * Places images as new layers: pasted from the system clipboard (Ctrl/Cmd+V outside text fields and dialogs; with the
 * lasso, Ctrl/Cmd+V pastes the selection instead), dropped on the element given `ref`, or chosen through `place`. The
 * engine decodes the image and centers it in the view, scaled down to fit. Must be created within a Solid owner, which
 * removes the listeners on disposal.
 */
export function createImagePlacement(options: {
  /** Whether a layer can be added now; a paste or drop at another time is left to the browser. */
  canPlace: () => boolean;
  /** The view's center in document pixels and its size in document pixels, where the image goes. */
  view: () => { center: Point; fit: ViewSize };
  send: (command: Extract<PaintCommand, { type: 'place-image' }>) => void;
}) {
  createEventListener(window, 'paste', (event: ClipboardEvent) => {
    if (editable(event.target) || (event.target instanceof Element && event.target.closest('dialog[open]'))) {
      return;
    }

    const file = imageFile(event.clipboardData?.files);
    if (file && options.canPlace()) {
      event.preventDefault();
      place(file);
    }
  });
  const drop = createNativeDroppable({
    accept: (event) => options.canPlace() && Array.from(event.dataTransfer?.types ?? []).includes('Files'),
    onEnter: (event) => event.preventDefault(),
    onOver: (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    onDrop: (event) => {
      const file = imageFile(event.dataTransfer?.files);
      if (file) {
        place(file);
      }
    }
  });

  return {
    /** Attach to the element that accepts dropped image files. */
    ref: drop.ref,
    /** An image file is being dragged over the drop element. */
    isOver: drop.isOver,
    place
  };

  /** Places `file` as a new layer named after it, without its extension. */
  function place(file: File) {
    const name = file.name.replace(/\.[^.]+$/, '') || 'Image';
    options.send({ type: 'place-image', file, name, ...options.view() });
  }
}

/** The first image among `files`, if any. */
function imageFile(files: FileList | undefined) {
  return Array.from(files ?? []).find((file) => file.type.startsWith('image/'));
}
