import { thumbnailFrame } from '@app-game/paint-core/layerThumbnails';
import type { DocumentRect } from '@app-game/paint-core/layersInView';
import { createEffect, createMemo, createSignal, createStore, onCleanup } from 'solid-js';
import type { LayerThumbnailsEvent } from '../engine';

/**
 * Small images of every layer's own pixels for layer panels, made by the drawing engine between strokes. They are
 * made only while some UI wants them (`want`), so variants that never show them pay nothing; the engine then sends
 * every layer's image, and later only those that changed. All thumbnails show the same document rectangle, `frame`,
 * so they line up.
 *
 * Pass `size` and `receive` to `createPaintEngine` as its `layerThumbnails` option. Must be created within a Solid
 * owner; disposing it releases every image.
 */
export function createLayerThumbnails() {
  /** Demand releases run during subtree disposal, including disposal inside an owned computation. */
  const [wanted, setWanted] = createSignal<readonly number[]>([], { ownedWrite: true });
  const size = createMemo(() => (wanted().length ? Math.max(...wanted()) : undefined));
  const [frame, setFrame] = createSignal<DocumentRect>(emptyFrame, { equals: sameRect });
  const [images, setImages] = createStore<Record<string, LayerThumbnail>>({});
  /** The object URL shown for each layer, kept outside the store so replaced ones can be revoked. */
  const urls = new Map<string, string>();

  // Nothing wants thumbnails any more: the engine stops making them, and the images go.
  createEffect(size, (current) => {
    if (current === undefined) {
      clear();
    }
  });
  onCleanup(() => {
    for (const url of urls.values()) {
      URL.revokeObjectURL(url);
    }

    urls.clear();
  });

  return {
    /** The thumbnail of layer `layerId`; undefined until the engine has sent one, and while nothing wants them. */
    thumbnail: (layerId: string): LayerThumbnail | undefined => images[layerId],
    /**
     * The document rectangle, in document pixels, that every thumbnail shows: the tile-aligned bounds of all paint,
     * or the tile around the origin for an empty drawing.
     */
    frame,
    want,
    /** The size, in device pixels on the longer side, the engine makes thumbnails at; undefined while not wanted. */
    size,
    receive
  };

  /**
   * Asks for thumbnails about `cssSize` CSS pixels on their longer side, 64 by default, at the device's pixel ratio and
   * at most 256 device pixels; several callers get the largest size asked for. Returns the release; thumbnails stop
   * once every caller has released. It writes state, so call it from `onSettled` in a component, returning the release
   * as its cleanup: `onSettled(() => layerThumbnails.want(64))`.
   */
  function want(cssSize = defaultCssSize) {
    const pixels = Math.min(256, Math.ceil(cssSize * (globalThis.devicePixelRatio || 1)));
    setWanted((list) => [...list, pixels]);
    let released = false;
    return () => {
      if (released) {
        return;
      }

      released = true;
      setWanted((list) => list.toSpliced(list.indexOf(pixels), 1));
    };
  }

  /**
   * Shows an engine batch: new images replace their layers' old ones, whose URLs are revoked, and layers missing
   * from `layerIds` lose theirs. Ignored while nothing wants thumbnails, such as a batch already on its way.
   */
  function receive(event: LayerThumbnailsEvent) {
    if (size() === undefined) {
      return;
    }

    const kept = new Set(event.layerIds);
    const removed = [...urls.keys()].filter((id) => !kept.has(id));
    const stale = removed.map((id) => urls.get(id)!);
    const added = event.thumbnails.map(({ layerId, image, width, height }) => {
      const previous = urls.get(layerId);
      if (previous) {
        stale.push(previous);
      }

      const src = URL.createObjectURL(image);
      urls.set(layerId, src);
      return { layerId, thumbnail: Object.freeze({ src, width, height }) };
    });
    for (const id of removed) {
      urls.delete(id);
    }

    setFrame(event.frame);
    setImages((draft) => {
      for (const id of removed) {
        delete draft[id];
      }

      for (const { layerId, thumbnail } of added) {
        draft[layerId] = thumbnail;
      }
    });
    for (const url of stale) {
      URL.revokeObjectURL(url);
    }
  }

  function clear() {
    const shown = [...urls.entries()];
    urls.clear();
    setImages((draft) => {
      for (const [id] of shown) {
        delete draft[id];
      }
    });
    setFrame(emptyFrame);
    for (const [, url] of shown) {
      URL.revokeObjectURL(url);
    }
  }
}

/** Layer thumbnails and the wish for them; see `createLayerThumbnails`. */
export type LayerThumbnails = ReturnType<typeof createLayerThumbnails>;

/** One layer's thumbnail image, for an `<img>`. */
export type LayerThumbnail = Readonly<{
  /** An object URL of a PNG of the layer's own pixels, transparent where it has none; revoked once replaced. */
  src: string;
  /** Image size in device pixels, with the aspect of `frame`; scale it to the CSS size shown. */
  width: number;
  height: number;
}>;

/** The thumbnails' size asked for by `want` without a size, in CSS pixels: Infinite Painter's layer strip. */
const defaultCssSize = 64;

/** The frame of an empty drawing, as the engine reports it. */
const emptyFrame = thumbnailFrame([]);

function sameRect(a: DocumentRect, b: DocumentRect) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
