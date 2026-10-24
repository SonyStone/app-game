import { createSignal } from 'solid-js';
import type { MapBounds, MapPoint } from '../map/format';
import { fitView, panBy, zoomAt, type MapView, type ScreenSize } from './view';

/**
 * Pan and zoom of the editor's canvas. The canvas reports its size through `setScreen`; a fit
 * asked for before the canvas has a size waits for it, so a map loaded at startup is framed.
 */
export function createMapView() {
  const [view, setView] = createSignal<MapView>({ x: 0, y: 0, zoom: 1 });
  const [screen, setScreenSignal] = createSignal<ScreenSize>({ width: 0, height: 0 });
  let current = { width: 0, height: 0 };
  let pendingFit: MapBounds | undefined;

  return {
    view,
    screen,

    /** Zoom as a percentage of world pixels per screen pixel. */
    percent: () => Math.round(view().zoom * 100),

    /** Takes the canvas size in CSS pixels; applies a waiting fit once it is not empty. */
    setScreen(size: ScreenSize) {
      current = size;
      setScreenSignal(size);

      if (pendingFit && size.width > 0 && size.height > 0) {
        setView(fitView(pendingFit, size));
        pendingFit = undefined;
      }
    },

    /** Frames `bounds` in the canvas. */
    fit(bounds: MapBounds) {
      if (current.width > 0 && current.height > 0) {
        setView(fitView(bounds, current));
      } else {
        pendingFit = bounds;
      }
    },

    /** Zooms by `factor` around `anchor` in canvas CSS pixels, by default its middle. */
    zoomBy(factor: number, anchor?: MapPoint) {
      setView((last) => zoomAt(last, current, anchor ?? { x: current.width / 2, y: current.height / 2 }, factor));
    },

    /** Slides the map by `delta` CSS pixels. */
    panBy(delta: MapPoint) {
      setView((last) => panBy(last, delta));
    }
  };
}

/** The editor's pan and zoom, as {@link createMapView} returns it. */
export type MapViewState = ReturnType<typeof createMapView>;
