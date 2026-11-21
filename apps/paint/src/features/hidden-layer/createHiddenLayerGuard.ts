import { makeTimer } from '@solid-primitives/timer';
import { createMemo, createSignal, onCleanup } from 'solid-js';

/**
 * Refuses brush and eraser contacts while the active layer cannot take paint, which the drawing engine would ignore
 * without a word, and says why instead: the layer is hidden, a folder it is in is hidden, or the active node is a
 * folder, which has no pixels of its own. `notice` names the layer, and the hidden folder, until that changes, the
 * notice is dismissed, or {@link noticeMs} pass. Pen and mouse contacts only; touch keeps navigating and Alt/Option
 * is left to color picking. Must be created within a Solid owner.
 */
export function createHiddenLayerGuard(options: {
  /** Whether the active tool paints with strokes: the brush or the eraser. */
  paints: () => boolean;
  /** The active node, if any, as {@link paintTarget} reads it from the engine state. */
  layer: () => PaintTarget | undefined;
}) {
  const [refused, setRefused] = createSignal<string>();
  let clearTimer: (() => void) | undefined;
  onCleanup(() => clearTimer?.());
  /** The layer or folder a contact was refused on, while it is still active and still cannot take paint. */
  const notice = createMemo(() => {
    const layer = options.layer();
    if (!layer || !refuses(layer) || layer.id !== refused()) {
      return undefined;
    }

    return {
      id: layer.id,
      name: layer.name,
      ...(layer.folder ? { folder: true } : {}),
      ...(layer.hiddenFolder ? { hiddenFolder: layer.hiddenFolder } : {})
    };
  });

  return {
    notice,
    /** Hides the notice. */
    dismiss() {
      clearTimer?.();
      setRefused(undefined);
    },
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'pointerType'>) =>
        options.paints() && !event.altKey && event.pointerType !== 'touch' && refuses(options.layer()),
      run() {
        clearTimer?.();
        setRefused(options.layer()?.id);
        clearTimer = makeTimer(() => setRefused(undefined), noticeMs, setTimeout);
      }
    }
  };
}

/** How long the notice stays after the last refused contact, in milliseconds. */
export const noticeMs = 5000;

/** What a stroke would paint on, and what stops it; see {@link paintTarget}. */
export type PaintTarget = {
  id: string;
  name: string;
  visible: boolean;
  /** The active node is a folder, which has no pixels of its own. */
  folder?: boolean;
  /** The nearest hidden folder the layer is in, which hides it whatever its own visibility. */
  hiddenFolder?: { id: string; name: string };
};

/** The active node of an engine state as the guard reads it; undefined when the state names none. */
export function paintTarget(state: {
  nodes: readonly { id: string; name: string; visible: boolean; kind: 'raster' | 'group'; parentId?: string }[];
  activeId: string;
}): PaintTarget | undefined {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const node = byId.get(state.activeId);
  if (!node) {
    return undefined;
  }

  const target = { id: node.id, name: node.name, visible: node.visible };
  if (node.kind === 'group') {
    return { ...target, folder: true };
  }

  for (let folder = byId.get(node.parentId ?? ''); folder; folder = byId.get(folder.parentId ?? '')) {
    if (!folder.visible) {
      return { ...target, hiddenFolder: { id: folder.id, name: folder.name } };
    }
  }

  return target;
}

/** Whether a stroke cannot paint `target`. */
function refuses(target: PaintTarget | undefined) {
  return !!target && (!target.visible || !!target.folder || !!target.hiddenFolder);
}
