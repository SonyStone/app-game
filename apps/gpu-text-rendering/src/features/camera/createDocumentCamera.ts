import { createSignal, untrack, type Accessor } from 'solid-js';
import type { TextDocument } from '../document/document';
import { documentBounds, fitCamera, type Camera } from './camera';

/**
 * Owns a document camera for the caller's lifetime. The camera is a signal: frame callbacks and draws that read it
 * redraw when it changes, so writers need no explicit invalidate. Writes from update-phase frame callbacks are
 * visible to the same frame's render. Pass the result to camera controls, the tour, document layers and the minimap.
 */
export function createDocumentCamera(options: {
  /** First page width divided by height; document units are first-page widths and heights. */
  pageAspect: Accessor<number>;
  /** Returns the camera to its initial view whenever this value changes, such as the displayed document. */
  resetOn?: Accessor<unknown>;
  /** Starting view, for example a copy of another pane's camera; later resets use the initial view. */
  start?: Camera;
}) {
  let start = options.start;
  const [camera, setCamera] = createSignal<Camera>(() => {
    options.resetOn?.();
    const view = start ?? initialCamera;
    start = undefined;
    return { ...view };
  });

  return {
    /** Current camera; replaced, never mutated. */
    camera,

    /** Replaces the camera. Use the updater form when deriving from the current camera within one event. */
    setCamera,

    /** First page width divided by height. */
    pageAspect: options.pageAspect,

    /** Fits all pages within a `size` CSS-pixel viewport less `padding`, resetting rotation. Reads nothing reactively. */
    fitToPages(
      pages: TextDocument['pages'],
      size: { width: number; height: number },
      padding?: Parameters<typeof fitCamera>[3]
    ) {
      setCamera(untrack(() => fitCamera(documentBounds(pages), size, options.pageAspect(), padding)));
    }
  };
}

/** Camera, setter, page aspect and fitting command; see createDocumentCamera. */
export type DocumentCamera = ReturnType<typeof createDocumentCamera>;

/** First page width divided by height, or 1 without a document. */
export function pageAspectOf(document: Pick<TextDocument, 'pages'> | undefined) {
  const first = document?.pages[0];
  return first ? first.width / first.height : 1;
}

/** A zoomed-out view centered on the first page. */
const initialCamera: Camera = { x: 0.5, y: 0.5, zoom: 2, rotation: 0 };
