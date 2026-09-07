import type { Brush, Sample } from '../brush';
import type { createDocument, Layer, TileChange } from '../document';
import type { createPaintRenderer } from '../gpu/renderer';
import type { StrokeProcessor, StrokeProcessorFactory } from '../strokeProcessors';
import type { createTileStore } from '../tileStore';
import type { BrushResourceReader, BrushResourcesFactory } from './brushResources';

/** Raster document operations shared by tools, persistence, history and selection. */
export type PaintDocument = ReturnType<typeof createDocument>;
/** One renderer owns document GPU resources and can present to multiple canvas targets. */
export type PaintRenderer = Awaited<ReturnType<typeof createPaintRenderer>>;
/** Renderer creation is scoped to a runtime/device lifetime, never to an individual target or stroke. */
export type RendererFactory = typeof createPaintRenderer;

/** Immutable tile versions plus atomic checkpoints. Adapters must preserve undo references during collect.
 * Save failures reject and retain staged pixels. close reports its outcome and releases resources.
 * Replication requires a separate ordered document-operation protocol, not just a storage adapter.
 */
export type PaintStorage = Awaited<ReturnType<typeof createTileStore>>;
/** Opens one storage session; its name identifies the document namespace. */
export type StorageFactory = (name: string) => Promise<PaintStorage>;

/** Owns one stroke. add commits input, preview is disposable, finish returns atomic document changes.
 * Methods are called serially; no engine or processor is replaced until this stroke ends/cancels.
 */
export type BrushSession = {
  add(samples: readonly Sample[]): Promise<void>;
  preview(enabled: boolean): void;
  finish(): Promise<TileChange[]>;
  cancel(): void;
};

/** Engine-specific GPU resources can be shared in the factory closure. Output need not be round dabs.
 * A custom engine must present its transient output through the paired renderer and return immutable tiles.
 */
export type BrushEngine = (context: {
  /** Untrusted transport data; defineBrushEngine narrows it with the engine's decoder. */
  settings?: unknown;
  /** Decoded textures pinned for this stroke. Resolve required IDs before creating GPU state. */
  resources: BrushResourceReader;
  brush: Brush;
  layer: Layer;
  processor: StrokeProcessor;
  renderer: PaintRenderer;
}) => BrushSession;

/** Explicit dependencies of the ordered document runtime. Registries are resolved only at pen-down. */
export type PaintModules = {
  document: () => PaintDocument;
  /** Creates the runtime-owned decoded brush cache, independent of document storage. */
  resources: BrushResourcesFactory;
  storage: StorageFactory;
  renderer: RendererFactory;
  processors: Readonly<Record<string, StrokeProcessorFactory>>;
  engines: Readonly<Record<string, BrushEngine>>;
  /** Tool/preset routing may select an ABR or other engine without modifying the command loop. */
  selectEngine: (brush: Brush) => string;
  /** Studio selects brush.stroke.mode; applications can select custom processor IDs. */
  selectProcessor: (brush: Brush) => string;
};
