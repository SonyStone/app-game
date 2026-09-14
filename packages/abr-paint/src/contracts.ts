import type { ColorMixing } from '@app-game/abr-brush/effects';
import type { AbrBrushSettings } from './engine';
import type { AbrRasterSettings } from './gpu/abrStamps';
import type { createMixerWells } from './gpu/mixerWells';
import type { Dab, Sample } from './input';
import type { BrushResourceReader } from './resources';

/** Host services borrowed by one stroke. Layer and Change remain opaque host-owned document types. */
export type AbrStrokeContext<Layer, Change, Brush extends AbrBrushInput> = {
  settings: AbrBrushSettings;
  resources: BrushResourceReader;
  brush: Brush;
  layer: Layer;
  /** Ordered source layers for Sample All Layers; omission uses the active layer. */
  layers?: readonly Layer[];
  /** Immutable selected history state; required only when restoring history. */
  historySource?: Layer;
  modifiers?: Readonly<{ altKey: boolean }>;
  view?: Readonly<{ zoom: number; angle: number; mirrored: boolean }>;
  /** Permanent approximation captured at contact. Omission preserves detailed rendering. */
  adaptiveQuality?: boolean;
  /** Integer document LOD captured at contact, excluding temporary loading fallbacks. Defaults to zero. */
  lod?: number;
  processor: AbrStrokeProcessor;
  renderer: AbrStrokeRenderer<Layer, Change, Brush>;
};

/** Only the brush controls consumed by this engine. Hosts may extend this with their own tool/UI settings. */
export type AbrBrushInput = {
  size: number;
  color: string;
  backgroundColor?: string;
  flow: number;
  opacity: number;
  mixing: ColorMixing;
  stroke: { mode: string };
};

/** Input processors preserve real sample order. preview is disposable; finish flushes the withheld tail once. */
export type AbrStrokeProcessor = {
  add(samples: readonly Sample[]): Sample[];
  preview(): Sample[];
  finish(): Sample[];
  /** Optional stationary catch-up. Empty output suspends the idle clock until new input. */
  idle?(elapsedMs: number): Sample[];
};

/** All methods are serialized by the host. No engine replacement until finish or cancel. */
export type AbrStrokeSession<Change> = {
  add(samples: readonly Sample[]): Promise<void>;
  preview(enabled: boolean): void;
  /** Returns immutable changes; the host commits them atomically and schedules saving. */
  finish(): Promise<Change[]>;
  cancel(): void;
  idle?(elapsedMs: number): Promise<boolean>;
};

/** Renderer adapter for ABR tools. Owns tile allocation, persistence and presentation, outside the brush engine. */
export type AbrStrokeRenderer<Layer, Change, Brush extends AbrBrushInput> = {
  /** Starts transient output after all preset resources have been resolved. */
  begin(layer: Layer, brush: Brush, tip: undefined, settings: AbrRasterSettings<Layer>): void;
  /** Preserves dab order, including canvas pickup dependencies. May present progress without changing pixels. */
  paint(dabs: readonly Dab[]): Promise<void>;
  /** Replaces disposable endpoint output without committing it to the document. */
  preview(dabs: readonly Dab[]): void;
  finish(): Promise<Change[]>;
  cancel(): void;
  readCommittedPixel(layer: Layer, point: { x: number; y: number }): Promise<Uint8Array>;
  mixerCommand(...args: Parameters<ReturnType<typeof createMixerWells>['command']>): void;
  loadMixerFromCanvas(options: Parameters<ReturnType<typeof createMixerWells>['begin']>[2] & {
    key: string; color: string; point: { x: number; y: number }; size: number;
    layers: readonly Layer[]; allLayers: boolean; solid: boolean;
  }): Promise<void>;
};
