import type { PsdEditorSession as EditorHandle } from '../wasm/photoshop_psd_wasm.js';
import { loadPsd } from './index';

/**
 * Opens a source-preserving editor without rendering or fetching assets. The caller must dispose it.
 * Parsing failures are results; codec initialization failures reject and can be retried.
 */
export async function openPsdEditor(bytes: ArrayBuffer | Uint8Array): Promise<PsdEditorResult<PsdEditorSession>> {
  const codec = await loadPsd();
  const opened = attempt(() => new codec.PsdEditorSession(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));
  if (!opened.ok) {
    return opened;
  }

  const handle = opened.value;
  let disposed = false;
  const run = <T>(operation: () => T): PsdEditorResult<T> =>
    disposed
      ? { ok: false, error: { code: 'Disposed', message: 'The editor session is disposed.' } }
      : attempt(operation);

  return {
    ok: true,
    value: {
      inspect: () => run(() => handle.inspect()),
      inspectSource: () => run(() => handle.inspectSource()),
      inspectProcess: () => run(() => handle.inspectProcess()),
      sourceSnapshot: () => run(() => handle.sourceSnapshot()),
      editRasterTreeExact: (batch, context) => run(() => handle.editRasterTreeExact(batch, context)),
      editStateMetadata: (batch) => run(() => handle.editStateMetadata(batch)),
      prepareSave: (linearBlending = false) => run(() => makePreparedSave(handle.prepareSave(linearBlending))),
      preparePhotoshop26Save: (context) => run(() => makePreparedSave(handle.preparePhotoshop26Save(context))),
      prepareReopenCandidate: (context, layerTimes) =>
        run(() => makePreparedSave(handle.prepareReopenCandidate(context, layerTimes))),
      preparePhotoshop26ResourceCandidate: (context) => run(() => handle.preparePhotoshop26ResourceCandidate(context)),
      preparePhotoshop26XmpCandidate: (context) =>
        run(() => makePreparedSave(handle.preparePhotoshop26XmpCandidate(context))),
      preparePhotoshop26EmptyPathsCandidate: () =>
        run(() => makePreparedSave(handle.preparePhotoshop26EmptyPathsCandidate())),
      preparePhotoshop26ShapeCacheCandidate: (layerId) =>
        run(() => makePreparedSave(handle.preparePhotoshop26ShapeCacheCandidate(layerId))),
      preparePhotoshop26LayerRecordCandidate: (physicalIndex) =>
        run(() => makePreparedSave(handle.preparePhotoshop26LayerRecordCandidate(physicalIndex))),
      dispose() {
        if (disposed) {
          return;
        }

        disposed = true;
        handle.dispose();
        handle.free();
      }
    }
  };
}

/** Bounded editor operations. All failed edit batches preserve source, revision, selection and ID allocation. */
export interface PsdEditorSession {
  /** Reads the bottom-to-top tree and revision. Unsupported inspection returns a refusal; untouched saving still works. */
  inspect(): PsdEditorResult<ReturnType<EditorHandle['inspect']>>;
  /** Reads stored metadata without RGB8 tree admission. Physical record indices change after structural edits. */
  inspectSource(): PsdEditorResult<ReturnType<EditorHandle['inspectSource']>>;
  /** Reads native mode/depth, bounds and persistent IDs without display conversion or tree admission. */
  inspectProcess(): PsdEditorResult<ReturnType<EditorHandle['inspectProcess']>>;
  /** Copies serialized source and revision. Pending visual caches may be stale; use prepareSave for output. */
  sourceSnapshot(): PsdEditorResult<ReturnType<EditorHandle['sourceSnapshot']>>;
  /**
   * Applies the requested reopen-equivalent contract atomically and freezes complete save bytes.
   * Admits measured RGB8 raster properties, opaque same-bounds pixels, existing independent mask samples,
   * insertion/deletion/reorder and grouping below six levels, and same-target scalar batches. RGB16 admits rename/opacity;
   * Gray8 and embedded-SWOP CMYK8 also admit opaque native process planes, with explicit preview conversion.
   * Positions are bottom to top after removal. Insert returns allocated IDs and needs the new ID's time.
   * Rename/opacity/Fill/blend/pixels/mask need one target time; hide/delete/move preserve times and take none.
   * Grouping needs the header and hidden end ID's times plus explicit panel expansion; ungrouping takes no times.
   * Without writers, sources need measured profiles, native metadata, 72 ppi and unscaled opaque previews.
   * Prepared writers consume actual host resource, compositor, ICC, credential and initial-history operands.
   * v2-carried-type additionally requires text gamma and the complete active PostScript inventory. Untouched
   * type records/caches/Txt2 stay byte-identical and compare against Photoshop's reopening of the source;
   * remaining observations keep v1's native edit/save reference. Type targets/ancestors and prior revisions refuse.
   * v3-carried-untouched carries independent complete layer records and channel streams byte-identically.
   * Edited subtrees, ancestors and clipping chains remain dependent. It requires writers, the full active-font
   * inventory and a localized Background name. Single top-layer structural edits keep existing clipping runs;
   * hidden RGB8 pixels and selected-hidden opacity retain named refusals. Visible same-bounds opaque RGB16
   * process replacement retains admitted metadata. No contract falls back to another after refusal.
   * v2 also admits bounded Background lifecycles, including opacity promotion with the actual localized name
   * and the resulting ID's explicit time. Lock-protected operations, hidden unselected targets, Background moves/grouping,
   * unsupported histories/profiles, mixed-target/structural batches and active OCIO return named atomic refusals.
   * Missing context refuses nonempty batches; an empty batch certifies no save. Source-specific writer guards
   * remain authoritative; callers must handle Dependency rather than infer admission from inspection.
   * The bundled validator currently requires a softwareAgent beginning with "Adobe Photoshop ". A non-Adobe
   * host must refuse this path rather than claim that identity. New-document creation has a separate honest-agent contract.
   * This contract excludes Adobe JPEG entropy and container byte equivalence. No timestamps or save identities are generated.
   */
  editRasterTreeExact(
    batch: readonly PsdExactRasterTreeEdit[],
    context?: PsdReopenSaveContext
  ): PsdEditorResult<PsdEditOutcome>;
  /**
   * Applies nonvisual metadata writes atomically. File Info publicDomain requires explicit lifecycle values and
   * canonical PS26 XMP/IIM/MD5/EXIF companions. Its bundled copyright writer hardcodes Photoshop attribution;
   * non-Adobe hosts must refuse copyright writes until a truthful agent operand is supported.
   * Other copyright transitions, titles and scalar XMP writes refuse.
   */
  editStateMetadata(batch: readonly PsdStateMetadataEdit[]): PsdEditorResult<PsdEditOutcome>;
  /**
   * Freezes strict output; defaults to encoded RGB blending. Exact transactions retain their already-frozen bytes
   * at either blending setting. Dispose the returned save even if a chunk read fails. Chunk size is 1..16 MiB;
   * invalid sizes or reads after save disposal throw. Saves remain independent of later session edits/disposal.
   */
  prepareSave(linearBlending?: boolean): PsdEditorResult<PsdPreparedSave>;
  /**
   * Requests complete native preparation with every explicit current-save operand. This research endpoint
   * currently refuses at save.thumbnail.adobe-jpeg; it grants no complete native-save certificate.
   * Source and revision remain unchanged. Dispose any returned save after use.
   */
  preparePhotoshop26Save(context: PsdPhotoshop26SaveContext): PsdEditorResult<PsdPreparedSave>;
  /**
   * Prepares the bounded v1 RGB8/sRGB opaque 72-ppi research candidate after an edit, with explicit save and
   * layer times. An untouched session returns Invalid. Changes no session state and grants no equivalence
   * certificate or new edit admission. Dispose after use.
   */
  prepareReopenCandidate(
    context: PsdPhotoshop26SaveContext,
    layerTimes: PsdReopenSaveContext['layerTimes']
  ): PsdEditorResult<PsdPreparedSave>;
  /**
   * Prepares researched resource products with actual host operands and returns unresolved dependencies.
   * The owned bytes are a partial candidate, never a whole-save certificate; source and revision do not change.
   */
  preparePhotoshop26ResourceCandidate(context: PsdSaveResourceContext): PsdEditorResult<PsdResourceSaveCandidate>;
  /**
   * Prepares resource 1060 using explicit clocks, identities and any required initial history event.
   * Missing import/runtime rules refuse. Preserves session state; this partial save must be disposed.
   */
  preparePhotoshop26XmpCandidate(context: PsdXmpSaveContext): PsdEditorResult<PsdPreparedSave>;
  /**
   * Prepares omission of an imported typed empty pths carrier. Nonempty paths, symmetry and unknown fields refuse.
   * Preserves revision and unrelated bytes; grants no whole-save certificate. Dispose after use.
   */
  preparePhotoshop26EmptyPathsCandidate(): PsdEditorResult<PsdPreparedSave>;
  /**
   * Prepares one solid RGB8 shape's cache from source geometry/fill, preserving revision and unrelated bytes.
   * Requires an enabled closed version-3 path, no independent mask/stroke/feather, coordinates within +/-2000
   * and at most four million stored pixels. Grants no complete native-save certificate. Dispose after use.
   */
  preparePhotoshop26ShapeCacheCandidate(layerId: number): PsdEditorResult<PsdPreparedSave>;
  /**
   * Prepares bounded native import/save defaults, noise fills, embedded smart descriptors and Gray8 masks
   * for one zero-based physical record, including group markers. Reinspect indices after structural edits.
   * Preserves revision/unrelated bytes, invents no IDs/times and grants no whole-save certificate. Dispose after use.
   */
  preparePhotoshop26LayerRecordCandidate(physicalIndex: number): PsdEditorResult<PsdPreparedSave>;
  /** Releases the source/model once. Later operations return Disposed; existing prepared saves remain usable. */
  dispose(): void;
}

/** Raster/tree and native process-plane commands; unsupported variants return atomic dependency refusals. */
export type PsdExactRasterTreeEdit = Parameters<EditorHandle['editRasterTreeExact']>[0][number];

/** Explicit host save operands, per-layer edit times and optional original sRGB preview profile. No defaults are invented. */
export type PsdReopenSaveContext = NonNullable<Parameters<EditorHandle['editRasterTreeExact']>[1]>;

/** v1 native save, v2 carried type or v3 carried untouched layers; callers opt in explicitly. */
export type PsdReopenSaveContract = PsdReopenSaveContext['contract'];

/**
 * Current-save basename, ISO/EXIF timestamps, instance/document UUIDs, Photoshop agent and host gamma-1
 * preference. The host supplies every value; the facade never reads a clock or generates save identities.
 */
export type PsdPhotoshop26SaveContext = PsdReopenSaveContext['save'];

/** Explicit resource, compositor, ICC, credential, localized proof and initial-history writer operands. */
export type PsdReopenSaveWriters = NonNullable<PsdReopenSaveContext['writers']>;

/** Actual text gamma and complete active PostScript inventory; this neither discovers nor activates fonts. */
export type PsdCarriedTypeRendering = Extract<
  PsdReopenSaveContext,
  { contract: 'photoshop26.reopen-equivalent/v2-carried-type' }
>['typeRendering'];

/** Actual host resource labels, resolution/grid defaults, guide color, EXIF clock and tagged-profile comparison. */
export type PsdSaveResourceContext = Parameters<EditorHandle['preparePhotoshop26ResourceCandidate']>[0];

/** Explicit save clocks/identities plus the first saved event's runtime leaves when required by source history. */
export type PsdXmpSaveContext = Parameters<EditorHandle['preparePhotoshop26XmpCandidate']>[0];

/** Owned candidate bytes at the unchanged revision, with every unresolved resource/body dependency retained. */
export type PsdResourceSaveCandidate = ReturnType<EditorHandle['preparePhotoshop26ResourceCandidate']>;

/** Nonvisual metadata commands, including bounded File Info copyright and resolution without resampling. */
export type PsdStateMetadataEdit = Parameters<EditorHandle['editStateMetadata']>[0][number];

/** Explicit File Info modification timestamp, instance ID and document ID supplied by the save host. */
export type PsdMetadataSaveContext = NonNullable<
  Extract<PsdStateMetadataEdit, { kind: 'fileInfoCopyright' }>['saveContext']
>;

/** Committed revision and IDs created in batch order; IDs are stable until removed. */
export type PsdEditOutcome = ReturnType<EditorHandle['editRasterTreeExact']>;

/** Independent frozen bytes with bounded chunk reads. Dispose after consuming or abandoning the output. */
export interface PsdPreparedSave {
  /** Revision frozen when the save was prepared. */
  readonly revision: ReturnType<EditorHandle['prepareSave']>['revision'];
  /** Returns at most maxBytes, 1..16 MiB, or undefined at EOF. Invalid sizes and disposed reads throw. */
  nextChunk(maxBytes: number): Uint8Array | undefined;
  /** Releases both the frozen bytes and WASM handle once. */
  dispose(): void;
}

/** An editor value or a structured refusal; dependency paths and missing capabilities survive WASM translation. */
export type PsdEditorResult<T> = { ok: true; value: T } | { ok: false; error: PsdEditorFailure };

/** Named editor refusals. A refused operation never falls back to a less strict edit or save. */
export type PsdEditorFailure = (
  | { code: 'Dependency'; message: string; propertyPath: string; capability: string }
  | { code: 'ResourceBudget'; message: string; resource: string; requested: bigint; limit: bigint }
  | { code: 'Allocation'; message: string; requested: bigint }
  | {
      code:
        | 'Container'
        | 'Invalid'
        | 'MissingLayer'
        | 'Budget'
        | 'CachesRequired'
        | 'RenderRequired'
        | 'DitheredGradient'
        | 'UnsupportedGradientInterpolation'
        | 'Disposed'
        | 'Unknown';
      message: string;
    }
) & {
  /** Original binding exception. RenderRequired retains the renderer's reason in its message. */
  readonly cause?: unknown;
};

/** Keeps the prepared resource independent of the session and releases its WASM handle with its bytes. */
function makePreparedSave(handle: ReturnType<EditorHandle['prepareSave']>): PsdPreparedSave {
  let disposed = false;
  return {
    revision: handle.revision,
    nextChunk(maxBytes) {
      if (disposed) {
        throw new Error('The prepared save is disposed.');
      }

      return handle.nextChunk(maxBytes);
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      handle.dispose();
      handle.free();
    }
  };
}

/** Converts only the binding's documented error fields; unexpected failures stay distinguishable. */
function attempt<T>(operation: () => T): PsdEditorResult<T> {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error: toFailure(error) };
  }
}

function toFailure(error: unknown): PsdEditorFailure {
  return { ...classifyFailure(error), cause: error };
}

/** Keeps binding codes, dependency paths and resource limits without parsing human-readable messages. */
function classifyFailure(error: unknown): PsdEditorFailure {
  if (!(error instanceof Error)) {
    return { code: 'Unknown', message: String(error) };
  }

  const { message } = error;
  if ('code' in error) {
    const { code } = error;
    if (
      code === 'Dependency' &&
      'propertyPath' in error &&
      typeof error.propertyPath === 'string' &&
      'capability' in error &&
      typeof error.capability === 'string'
    ) {
      return { code, message, propertyPath: error.propertyPath, capability: error.capability };
    }

    switch (code) {
      case 'Container':
      case 'Invalid':
      case 'MissingLayer':
      case 'Budget':
      case 'CachesRequired':
      case 'RenderRequired':
      case 'DitheredGradient':
      case 'UnsupportedGradientInterpolation':
        return { code, message };
    }
  }

  if ('requested' in error && typeof error.requested === 'bigint') {
    if (
      error.name === 'PsdBudgetError' &&
      'resource' in error &&
      typeof error.resource === 'string' &&
      'limit' in error &&
      typeof error.limit === 'bigint'
    ) {
      return {
        code: 'ResourceBudget',
        message,
        resource: error.resource,
        requested: error.requested,
        limit: error.limit
      };
    }

    if (error.name === 'PsdAllocationError') {
      return { code: 'Allocation', message, requested: error.requested };
    }
  }

  return { code: error instanceof TypeError ? 'Invalid' : 'Unknown', message };
}
