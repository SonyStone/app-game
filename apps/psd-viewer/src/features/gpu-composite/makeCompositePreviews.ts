import { gpuCompositeCapability, type PsdGpuLayers } from '@app-game/psd/gpu';
import type { PsdRegionPixels, PsdRegionRect } from '@app-game/psd/viewer';
import type { DisplayTile } from '../gpu-viewport/displayTiles';
import type { WindowClient } from '../psd-worker/makePsdWorkerPool';
import { viewerPerformance } from '../telemetry/performance';
import type { WindowSnapshot } from '../viewport/makeWindowRenderer';

/** Bounded diagnostics, retained independently of opt-in performance sampling. */
export type CompositeDiagnostics = {
  capability: string;
  state: 'idle' | 'preparing' | 'preview' | 'verified' | 'unsupported' | 'disabled';
  reason?: string;
  preparedBytes: number;
  preparationMs: number;
  verifiedTiles: number;
  differingSamples: number;
  mismatches: { identity: string; differing: number; first: number; gpu: number; strict: number }[];
};

/**
 * Owns reusable raw regions separately from composite tiles. At most 24 MiB stays cached; a 32 MiB preparation
 * and two 2 MiB readback/transfer reserves fit within the additional 64 MiB CPU allowance. In-flight jobs are
 * serialized by the tile renderer. Verdicts compare every RGBA byte, including RGB beneath zero alpha.
 */
export function makeCompositePreviews(client: WindowClient, changed: (state: CompositeDiagnostics) => void = () => {}) {
  const sources = new Map<string, PsdGpuLayers>();
  let bytes = 0;
  let generation = 0;
  let documentLayers: WindowSnapshot['opened']['layers'] | undefined;
  let disabled = false;
  let rejectedSettings = new Set<string>();
  let diagnostics = emptyDiagnostics();
  const notify = (patch: Partial<CompositeDiagnostics>) => {
    diagnostics = { ...diagnostics, ...patch };
    changed(diagnostics);
  };

  return {
    /** Returns no candidate on any policy or budget refusal. The ordinary strict request always follows. */
    async prepare(
      snapshot: WindowSnapshot,
      rect: PsdRegionRect,
      clip: PsdRegionRect,
      onMismatch: () => void
    ): Promise<
      | {
          tile: DisplayTile;
          submitted: Promise<void>;
          strict: (image: PsdRegionPixels) => void;
        }
      | undefined
    > {
      if (documentLayers !== snapshot.opened.layers) {
        documentLayers = snapshot.opened.layers;
        generation++;
        sources.clear();
        bytes = 0;
        disabled = false;
        rejectedSettings = new Set();
        diagnostics = emptyDiagnostics();
      }
      const settingsKey = JSON.stringify([generation, snapshot.opened.document, 0, snapshot.settings]);
      if (disabled || rejectedSettings.has(settingsKey) || snapshot.opened.sourceBacked || !client.gpuLayers) {
        return undefined;
      }
      const sourceKey = JSON.stringify([settingsKey, rect]);
      let source = sources.get(sourceKey);
      if (!source) {
        const start = performance.now();
        notify({ state: 'preparing' });
        const prepared = await client.gpuLayers(snapshot.opened.document, rect, snapshot.settings);
        if (documentLayers !== snapshot.opened.layers || disabled) {
          return undefined;
        }
        if (!prepared.ok) {
          if (prepared.error.kind === 'unsupported') {
            rejectedSettings.add(settingsKey);
          }
          notify({ state: 'unsupported', reason: prepared.error.message });
          return undefined;
        }
        source = prepared.value;
        const required = source.layers.reduce((sum, layer) => sum + layer.samples.byteLength, 0);
        for (const [key, cached] of sources) {
          if (bytes + required <= 24 * 1024 * 1024) {
            break;
          }
          bytes -= cached.layers.reduce((sum, layer) => sum + layer.samples.byteLength, 0);
          sources.delete(key);
        }
        sources.set(sourceKey, source);
        bytes += required;
        notify({ preparedBytes: bytes, preparationMs: diagnostics.preparationMs + performance.now() - start });
        viewerPerformance.record('composite.prepare', start);
        viewerPerformance.record('composite.cpu.source.bytes', performance.now(), bytes);
      }
      sources.delete(sourceKey);
      sources.set(sourceKey, source);
      const identity = JSON.stringify([
        gpuCompositeCapability,
        settingsKey,
        rect,
        [...snapshot.visibility].sort((a, b) => a[0] - b[0])
      ]);
      const ownGeneration = generation;
      let candidate: Uint8Array | undefined;
      let strict: PsdRegionPixels | undefined;
      let compared = false;
      const verify = () => {
        if (!candidate || !strict || compared || ownGeneration !== generation || disabled) {
          return;
        }
        compared = true;
        let differing = 0;
        let first = -1;
        for (let i = 0; i < strict.pixels.length; i++) {
          if (candidate[i] !== strict.pixels[i]) {
            differing++;
            if (first < 0) {
              first = i;
            }
          }
        }
        if (candidate.length !== strict.pixels.length) {
          differing += Math.abs(candidate.length - strict.pixels.length);
        }
        if (differing || !strict.exactToLayerRender || strict.approximations.length) {
          disabled = true;
          sources.clear();
          bytes = 0;
          notify({
            state: 'disabled',
            preparedBytes: 0,
            reason: 'GPU mismatch: strict CPU tiles published; GPU disabled for this document and capability.',
            differingSamples: diagnostics.differingSamples + differing,
            mismatches: [
              ...diagnostics.mismatches,
              { identity, differing, first, gpu: candidate[first], strict: strict.pixels[first] }
            ].slice(-16)
          });
          viewerPerformance.record('composite.mismatch.samples', performance.now(), differing);
          onMismatch();
        } else {
          notify({ state: 'verified', verifiedTiles: diagnostics.verifiedTiles + 1 });
          viewerPerformance.record('composite.verified.samples', performance.now(), strict.pixels.length);
        }
        candidate = undefined;
        strict = undefined;
      };
      const groupVisibility = new Map<number, boolean>();
      const collect = (nodes: WindowSnapshot['opened']['layers']) => {
        for (const node of nodes) {
          if (node.children) {
            groupVisibility.set(node.index, node.visible);
            collect(node.children);
          }
        }
      };
      collect(snapshot.opened.layers);
      let submitted!: () => void;
      const submission = new Promise<void>((resolve) => {
        submitted = resolve;
      });
      const image: PsdRegionPixels = {
        ...rect,
        step: 1,
        pixels: new Uint8Array(0),
        source: 'layers',
        strategy: 'window',
        exactToLayerRender: false,
        approximations: []
      };
      notify({ state: 'preview', reason: undefined });
      return {
        submitted: submission,
        tile: {
          image,
          left: rect.left,
          top: rect.top,
          step: 1,
          clip,
          contentTile: true,
          gpu: {
            identity,
            sourceKey,
            source,
            visibility: snapshot.visibility,
            groupVisibility,
            linearBlending: snapshot.settings.linearBlending,
            forceMismatch:
              typeof location !== 'undefined' && new URLSearchParams(location.search).get('gpuMismatch') === '1',
            onSubmitted: submitted,
            onReadback(pixels) {
              candidate = pixels;
              verify();
            },
            onFailure(reason) {
              submitted();
              if (ownGeneration === generation) {
                disabled = true;
                sources.clear();
                bytes = 0;
                notify({ state: 'disabled', reason, preparedBytes: 0 });
                onMismatch();
              }
            }
          }
        },
        strict(image) {
          strict = image;
          verify();
        }
      };
    },
    /** Releases CPU source residency. A mismatch remains disabled until a different document is opened. */
    clear() {
      sources.clear();
      bytes = 0;
      notify({ preparedBytes: 0 });
    }
  };
}

function emptyDiagnostics(): CompositeDiagnostics {
  return {
    capability: gpuCompositeCapability,
    state: 'idle',
    preparedBytes: 0,
    preparationMs: 0,
    verifiedTiles: 0,
    differingSamples: 0,
    mismatches: []
  };
}
