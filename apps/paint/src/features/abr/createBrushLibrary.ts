import { createSignal, onCleanup } from 'solid-js';
import { attempt } from '@app-game/paint-core/asyncResult';
import type { BrushResource } from '@app-game/abr-paint/resources';
import type { BrushEngineSelection } from '@app-game/paint-core/composition/defineBrushEngine';
import type { PaintEndpoint } from '../engine/mainThreadEndpoint';
import type { PaintEvent } from '@app-game/paint-core/protocol';

/** Owns a session library and correlated uploads. Changes become selectable only after upload succeeds.
 * Imperative busy/selected state guards asynchronous work independently of Solid's batched updates.
 */
export function createBrushLibrary(options: {
  select: (engine: BrushEngineSelection | undefined) => void;
  canChange: () => boolean;
}) {
  const [library, setLibrary] = createSignal<BrushLibrary | undefined>(undefined, { ownedWrite: true });
  const [selected, setSelected] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  const [error, setError] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  let current: BrushLibrary | undefined, selectedId: string | undefined;
  let working = false,
    disposed = false;
  let endpoint: PaintEndpoint | undefined;
  const resident = new Set<string>();
  const pending = new Map<
    string,
    { id: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  onCleanup(() => {
    disposed = true;
    rejectPending();
    endpoint = undefined;
  });
  return {
    library,
    selected,
    busy,
    error,
    isBusy: () => working,
    hasSelection: () => selectedId !== undefined,
    /** A new runtime starts with no resident tip textures, even when the same canvas settings survive. */
    connect(value: PaintEndpoint | undefined) {
      rejectPending();
      endpoint = value;
    },
    receive(event: PaintEvent) {
      if (event.type !== 'brush-resources') return;
      const request = pending.get(event.requestId);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(event.requestId);
      if (!event.result.ok) {
        request.reject(new Error(event.result.error));
        return;
      }
      for (const id of event.result.value.evicted) resident.delete(id);
      resident.add(request.id);
      request.resolve();
    },
    /** Selects a detached preset only after all primary/texture/dual resources are acknowledged. */
    usePreset(preset: { resources: BrushResource[]; engine: BrushEngineSelection; name: string }) {
      return run(async () => {
        for (const resource of preset.resources) await upload(resource);
        if (disposed) return;
        const tip = preset.resources[0];
        if (!tip) throw new Error('The preset has no primary tip.');
        current = {
          name: preset.name,
          brushes: [{ id: tip.id, tipId: tip.id, name: preset.name, engine: preset.engine }],
          tips: preset.resources,
          skipped: 0,
          notices: 0
        };
        setLibrary(current);
        apply(tip.id);
      });
    },
    /** Called before re-enabling input on a replacement runtime. Rejects explicitly if upload fails. */
    async restore() {
      const item = current?.brushes.find((brush) => brush.id === selectedId);
      if (!item) return;
      const tip = current!.tips.find((tip) => tip.id === item.tipId);
      if (!tip) throw new Error('Selected brush tip is missing.');
      for (const resource of item.engine ? current!.tips : [tip]) await upload(resource);
    }
  };

  function setWorking(value: boolean) {
    working = value;
    setBusy(value);
  }
  function rejectPending() {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Drawing engine changed before the brush was ready.'));
    }
    pending.clear();
    resident.clear();
  }
  function upload(tip: BrushResource) {
    if (resident.has(tip.id)) return Promise.resolve();
    if (pending.size)
      return Promise.reject(new Error('The previous brush upload is still finishing. Try again shortly.'));
    const target = endpoint;
    if (!target) return Promise.reject(new Error('Wait for the drawing engine to finish preparing.'));
    return new Promise<void>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        // A timeout does not cancel the runtime command. Keep its correlation until acknowledgement
        // or disconnect so a retry cannot upload the same immutable ID twice.
        reject(new Error('Brush upload timed out.'));
      }, 30_000);
      pending.set(requestId, { id: tip.id, resolve, reject, timer });
      try {
        target.postMessage({ type: 'brush-resources', requestId, action: 'put', resource: tip });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });
  }
  function apply(id: string | undefined) {
    selectedId = id;
    setSelected(id);
    const item = current?.brushes.find((brush) => brush.id === id);
    options.select(item?.engine);
  }
  async function run(action: () => Promise<void>) {
    if (working || disposed || !options.canChange()) return false;
    setWorking(true);
    setError(undefined);
    const result = await attempt(action);
    if (!disposed) {
      if (!result.ok) setError(result.error.message);
      setWorking(false);
    }
    return result.ok && !disposed;
  }
}

/** The preset selected in this editor session. Source pixels outlive rendering-mode changes. */
type BrushLibrary = {
  name: string;
  brushes: { id: string; name: string; tipId: string; engine?: BrushEngineSelection }[];
  tips: BrushResource[];
  skipped: number;
  notices: number;
};
