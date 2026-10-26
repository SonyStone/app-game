import type {
  PsdDifference,
  PsdDocumentFonts,
  PsdFailure,
  PsdImage,
  PsdInfo,
  PsdLayerDetail,
  PsdLayerNode,
  PsdLayerPixels,
  PsdOpenAnswers,
  PsdOpening,
  PsdPathSummary,
  PsdRegionPixels,
  PsdRegionRect,
  PsdRenderSettings,
  PsdSavedProcessChannels,
  PsdStates,
  PsdTextSupport
} from '@app-game/psd/viewer';
import type { SessionFont } from '../fonts/addFontFile';
import type { DisplayTile } from '../gpu-viewport/displayTiles';
import type { PsdPerformanceSample } from '../telemetry/performance';

/**
 * A request to the PSD worker. `id` pairs it with its reply. `open` opens as Photoshop does, with `answers` to the
 * prompts Photoshop shows; a prompt left unanswered fails the request with a `needsAnswer` failure carrying it, and a
 * file Photoshop refuses with a `refused` one. Requests about a document name it by the `document` id its
 * `opened` reply gave; the worker refuses requests for a document it no longer holds with a `stale` failure. The
 * worker keeps one font library for its lifetime, across documents: `addFonts` adds font files to it (their buffers
 * transferred), and cached renders use its active faces with `typeLayers: false`. Optional `typeLayers` renders use its raster fonts.
 * Supplied files are partial input, so they never become an `availableFonts` missing-font inventory.
 */
export type PsdRequest = PsdRequestBody & { telemetry?: boolean };

/** Request payload, independent of optional diagnostics. */
type PsdRequestBody =
  | { id: number; type: 'open'; bytes: ArrayBuffer; answers?: PsdOpenAnswers; mode?: 'strict' }
  | {
      id: number;
      type: 'render';
      document: number;
      settings: PsdRenderSettings;
      /** Visibility overrides as `[layer record index, visible]`. */
      visibility: [number, boolean][];
    }
  | {
      id: number;
      type: 'renderWindow';
      document: number;
      settings: PsdRenderSettings;
      visibility: [number, boolean][];
      window: WindowRequest;
      /** Per-worker native admission, including the retained host source. */
      liveBytes?: number;
    }
  | { id: number; type: 'original'; document: number }
  | { id: number; type: 'channels'; document: number }
  | { id: number; type: 'paths'; document: number }
  | { id: number; type: 'merged'; document: number }
  | { id: number; type: 'difference'; document: number; render: number }
  | {
      id: number;
      type: 'detectBlending';
      document: number;
      /** The settings to render with; `linearBlending` is ignored, both values are tried. */
      settings: PsdRenderSettings;
      visibility: [number, boolean][];
    }
  | { id: number; type: 'layer'; document: number; index: number }
  | { id: number; type: 'addFonts'; fonts: ArrayBuffer[]; sources?: string[] }
  | { id: number; type: 'listFonts' }
  | { id: number; type: 'documentFonts'; document: number }
  | { id: number; type: 'textSupport'; document: number; index: number }
  | { id: number; type: 'close' };

/**
 * The worker's answer to the request with the same `id`. Pixel buffers are transferred, never copied.
 * `documentFonts` and `textSupport` preserve the facade's release mismatches, separately from font availability.
 */
export type PsdReply = PsdReplyBody & {
  performance?: PsdPerformanceSample[];
  /** Actual WASM capacity and retained source, independent of optional telemetry. */
  memory?: { wasmBytes: number; sourceBytes: number };
};

/** Reply payload, independent of optional diagnostics. */
type PsdReplyBody =
  | {
      id: number;
      type: 'opened';
      document: number;
      info: PsdInfo;
      layers: PsdLayerNode[];
      states: PsdStates;
      opening: PsdOpening;
    }
  | { id: number; type: 'rendered'; render: RenderedPixels }
  | { id: number; type: 'windowRendered'; images: WindowPixels[]; milliseconds: number }
  | { id: number; type: 'original'; bytes: Blob }
  | { id: number; type: 'channels'; channels: PsdSavedProcessChannels }
  | { id: number; type: 'paths'; paths: PsdPathSummary[] }
  | { id: number; type: 'merged'; image: PsdImage }
  | { id: number; type: 'difference'; difference: PsdDifference }
  | { id: number; type: 'blending'; detection: BlendingDetection }
  | { id: number; type: 'layer'; detail: PsdLayerDetail; pixels: PsdResultOf<PsdLayerPixels> }
  | {
      id: number;
      type: 'fontsAdded';
      /** Per file of the request, in order: the faces added, or why it was refused. */
      results: PsdResultOf<SessionFont[]>[];
      /** The library after adding. */
      fonts: SessionFont[];
    }
  | { id: number; type: 'fonts'; fonts: SessionFont[] }
  | { id: number; type: 'documentFonts'; report: PsdDocumentFonts }
  | { id: number; type: 'textSupport'; support: PsdTextSupport | null }
  | { id: number; type: 'closed' }
  | { id: number; type: 'failed'; error: WorkerFailure };

/**
 * Which of Photoshop's blending preferences, which documents do not record, reproduce the merged image Photoshop saved.
 * `linearBlending` is the "Blend RGB Colors Using Gamma 1.0" setting whose render differs in fewer samples; `textGamma`
 * whether "Blend Text Colors Using Gamma" is on, tried only for documents with type layers whose best render still
 * differs. Each is `null` when undecided: no merged image, no render, or both settings equally close (nothing the
 * setting affects). `differing` holds each tried render's differing samples, `null` where it did not render.
 */
export type BlendingDetection = {
  linearBlending: boolean | null;
  textGamma: boolean | null;
  differing: { encoded: number | null; linear: number | null; otherTextGamma: number | null };
};

/** A render as it crosses to the UI: its id names it in `difference` requests. */
export type RenderedPixels = PsdImage & {
  /** Retained display tiles. When present, pixels is empty and must not be treated as an assembled surface. */
  tiles?: readonly DisplayTile[];
  /** Current camera demand, separate from fidelity approximations and GPU upload completion. */
  quality?: {
    completed: number;
    required: number;
    step: number;
    coarse: boolean;
    kind: 'pointPreview' | 'source' | 'filtered';
  };
  render: number;
  depth: 8 | 16 | 32;
  milliseconds: number;
  approximations: string[];
  /** Present for a viewport surface or overview; its pixels map back into document space at this stride. */
  window?: Pick<PsdRegionPixels, 'left' | 'top' | 'step' | 'strategy' | 'source' | 'exactToLayerRender'>;
};

/**
 * Why a request produced no value: the viewer's own failures, `stale` for a request about a document or render the
 * worker no longer holds, and `superseded` for a render replaced by a newer one before it started.
 */
export type WorkerFailure = PsdFailure | { kind: 'stale' | 'superseded'; message: string };

/** A value or a failure, as the worker reports parts of a reply that may fail on their own. */
export type PsdResultOf<T> = { ok: true; value: T } | { ok: false; error: WorkerFailure };

/** Bounded rendering operations. Saved pixels are only a temporary first frame. */
export type WindowRequest =
  | { kind: 'regions'; rectangles: PsdRegionRect[]; mipStep?: number }
  | { kind: 'overview'; step: number }
  | { kind: 'saved'; step: number };

/** Above this canvas size, avoid whole-document recovery, rendering and comparison allocations. */
export function requiresWindowedRendering(size: { width: number; height: number }): boolean {
  return size.width * size.height > 16_777_216 || size.width > 16_384 || size.height > 16_384;
}

/** At most four million work pixels per window call, including conservative spatial fallbacks. */
export const windowWorkPixels = 4_194_304;

/** Filtered display products accompany canonical source bytes; saved overviews never acquire a mip claim. */
export type WindowPixels = PsdRegionPixels & { mips?: PsdRegionPixels[] };
