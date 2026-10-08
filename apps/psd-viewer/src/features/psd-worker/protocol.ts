import type {
  PsdDifference,
  PsdDocumentFonts,
  PsdFailure,
  PsdFontInfo,
  PsdImage,
  PsdInfo,
  PsdLayerDetail,
  PsdLayerNode,
  PsdLayerPixels,
  PsdRenderSettings,
  PsdTextSupport
} from '@app-game/psd/viewer';

/**
 * A request to the PSD worker. `id` pairs it with its reply. Requests about a document name it by the `document` id its
 * `opened` reply gave; the worker refuses requests for a document it no longer holds with a `stale` failure. The
 * worker keeps one font library for its lifetime, across documents: `addFonts` adds font files to it (their buffers
 * transferred), and renders with `typeLayers` re-render type layers with it.
 */
export type PsdRequest =
  | { id: number; type: 'open'; bytes: ArrayBuffer }
  | {
      id: number;
      type: 'render';
      document: number;
      settings: PsdRenderSettings;
      /** Visibility overrides as `[layer record index, visible]`. */
      visibility: [number, boolean][];
    }
  | { id: number; type: 'merged'; document: number }
  | { id: number; type: 'difference'; document: number; render: number }
  | { id: number; type: 'layer'; document: number; index: number }
  | { id: number; type: 'addFonts'; fonts: ArrayBuffer[] }
  | { id: number; type: 'listFonts' }
  | { id: number; type: 'documentFonts'; document: number }
  | { id: number; type: 'textSupport'; document: number; index: number }
  | { id: number; type: 'close' };

/** The worker's answer to the request with the same `id`. Pixel buffers are transferred, never copied. */
export type PsdReply =
  | { id: number; type: 'opened'; document: number; info: PsdInfo; layers: PsdLayerNode[] }
  | { id: number; type: 'rendered'; render: RenderedPixels }
  | { id: number; type: 'merged'; image: PsdImage }
  | { id: number; type: 'difference'; difference: PsdDifference }
  | { id: number; type: 'layer'; detail: PsdLayerDetail; pixels: PsdResultOf<PsdLayerPixels> }
  | {
      id: number;
      type: 'fontsAdded';
      /** Per file of the request, in order: the font added, or why it was refused. */
      results: PsdResultOf<PsdFontInfo>[];
      /** The library after adding. */
      fonts: PsdFontInfo[];
    }
  | { id: number; type: 'fonts'; fonts: PsdFontInfo[] }
  | { id: number; type: 'documentFonts'; report: PsdDocumentFonts }
  | { id: number; type: 'textSupport'; support: PsdTextSupport | null }
  | { id: number; type: 'closed' }
  | { id: number; type: 'failed'; error: WorkerFailure };

/** A render as it crosses to the UI: its id names it in `difference` requests. */
export type RenderedPixels = PsdImage & {
  render: number;
  depth: 8 | 16 | 32;
  milliseconds: number;
  approximations: string[];
};

/**
 * Why a request produced no value: the viewer's own failures, `stale` for a request about a document or render the
 * worker no longer holds, and `superseded` for a render replaced by a newer one before it started.
 */
export type WorkerFailure = PsdFailure | { kind: 'stale' | 'superseded'; message: string };

/** A value or a failure, as the worker reports parts of a reply that may fail on their own. */
export type PsdResultOf<T> = { ok: true; value: T } | { ok: false; error: WorkerFailure };
