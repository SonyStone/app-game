import { createSignal, type Accessor } from 'solid-js';
import type { Camera } from '../camera/camera';
import { createDocumentCamera, pageAspectOf } from '../camera/createDocumentCamera';
import type { TextDocument } from '../document/document';
import { createViewport } from '../viewport/createViewport';

/**
 * Owns one pane of the viewer for the caller's lifetime: its canvas element, viewport sizing, camera and drag state.
 * The canvas may be absent until it mounts. The camera starts from `view` when given, and returns to its initial view
 * for each new `document`.
 */
export function createViewPane(
  document: Accessor<TextDocument | undefined>,
  /** Starting view, for example the focused pane's camera when a pane opens beside it. */
  view?: Camera
) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  // Camera controls report false while they are disposed, which Solid treats as an owned scope.
  const [dragging, setDragging] = createSignal(false, { ownedWrite: true });

  return {
    /** The pane's canvas; set through `setCanvas` as a ref. */
    canvas,
    setCanvas,
    viewport: createViewport(canvas, { maxDpr: 2 }),
    camera: createDocumentCamera({ pageAspect: () => pageAspectOf(document()), resetOn: document, start: view }),
    /** Whether a pointer is pressed on the pane's canvas, for cursor feedback. */
    dragging,
    setDragging
  };
}

/** One viewer pane; see createViewPane. */
export type ViewPane = ReturnType<typeof createViewPane>;
