import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { Camera } from '../camera/camera';
import { flyCamera } from '../camera/makeViewTour';

/**
 * Owns the session's saved camera views for the caller's lifetime, and the flight between them: a visit to one view,
 * or a looping tour through all of them. Changing `resetOn`, such as the displayed document, forgets every view and
 * stops flying. Connect `stops`, `route`, `reportVisit` and `stop` to a ViewTour beneath the pane's FrameLoop.
 */
export function createSavedViews(resetOn: Accessor<unknown>) {
  const [views, setViews] = createSignal<SavedView[]>(() => {
    resetOn();
    return [];
  });
  const [motion, setMotion] = createSignal<
    { kind: 'visit'; view: SavedView } | { kind: 'tour'; start: number } | undefined
  >(() => {
    resetOn();
    return undefined;
  });
  const [selected, setSelected] = createSignal<SavedView>();
  const [capturing, setCapturing] = createSignal(() => {
    resetOn();
    return false;
  });

  /** A new route object for each visit or tour, which restarts the flight from the displayed camera. */
  const route = createMemo(() => {
    const current = motion();

    if (!current || !views().length) {
      return undefined;
    }

    return current.kind === 'visit' ? { start: 0, loop: false } : { start: current.start, loop: true };
  });

  /** Stops any visit or tour, leaving the camera where it is. */
  const stop = () => setMotion(undefined);

  return {
    /** Saved views in the order they were saved. */
    views,

    /** The view last visited or toured to, for highlighting; undefined once it is removed. */
    selected: () => {
      const view = selected();
      return view && views().includes(view) ? view : undefined;
    },

    /** Whether the looping tour is running. */
    playing: () => route()?.loop === true,

    /** Whether a save awaits the next presented frame; connect to ViewCapture's `pending`. */
    capturing,

    /** Asks for the next presented frame to be saved through `capture`. */
    save() {
      setCapturing(true);
    },

    /**
     * Completes a save: appends `camera` with a square thumbnail cropped from the center of `canvas`, which must hold a
     * readable frame, as during ViewCapture's `onCapture`.
     */
    capture(camera: Camera, canvas: HTMLCanvasElement) {
      setCapturing(false);
      setViews((views) => [...views, { camera: { ...camera }, thumbnail: captureThumbnail(canvas) }]);
    },

    /** Forgets `view`, stopping a visit that is flying to it; a tour continues with the remaining views. */
    remove(view: SavedView) {
      setViews((views) => views.filter((other) => other !== view));
      setMotion((current) => (current?.kind === 'visit' && current.view === view ? undefined : current));
    },

    /** Flies once to `view`, replacing a running visit or tour. */
    visit(view: SavedView) {
      setSelected(view);
      setMotion({ kind: 'visit', view });
    },

    /**
     * Stops any flight and returns the camera at a fractional `position` along the saved views, where whole numbers are
     * view indices and fractions lie on the flight between neighbours. Selects the nearest view. Undefined without views.
     */
    scrub(position: number) {
      const list = views();

      if (!list.length) {
        return undefined;
      }

      const clamped = Math.min(Math.max(position, 0), list.length - 1);
      const index = Math.floor(clamped);
      const next = Math.min(index + 1, list.length - 1);

      stop();
      setSelected(list[Math.round(clamped)]);

      return flyCamera(list[index]!.camera, list[next]!.camera, clamped - index);
    },

    /** Starts the looping tour at the view after the selected one, or stops a running tour. */
    toggleTour() {
      const view = selected();
      const start = view ? views().indexOf(view) + 1 : 0;
      setMotion((current) => (current?.kind === 'tour' ? undefined : { kind: 'tour', start }));
    },

    stop,

    /** Cameras for ViewTour to fly through: the visited view alone, or every view while touring. */
    stops: () => {
      const current = motion();
      return current?.kind === 'visit' ? [current.view.camera] : views().map((view) => view.camera);
    },

    /** ViewTour route; undefined while no flight is running or no views remain. */
    route,

    /** Records the view that ViewTour reports flying to, as an index into `stops`. */
    reportVisit(index: number) {
      if (motion()?.kind === 'tour') {
        setSelected(views()[index]);
      }
    }
  };
}

/** A camera the user saved, with a thumbnail of what the pane showed at the time. */
export type SavedView = {
  camera: Camera;
  /** Square JPEG data URL, or an empty string when the canvas could not be read. */
  thumbnail: string;
};

/** Saved views, their selection and flight commands; see createSavedViews. */
export type SavedViews = ReturnType<typeof createSavedViews>;

/** Crops the largest centered square from `canvas`'s current image and scales it to a small JPEG. */
function captureThumbnail(canvas: HTMLCanvasElement) {
  const thumbnail = document.createElement('canvas');
  thumbnail.width = thumbnailPixels;
  thumbnail.height = thumbnailPixels;
  const context = thumbnail.getContext('2d');
  const side = Math.min(canvas.width, canvas.height);

  if (!context || side === 0) {
    return '';
  }

  context.drawImage(
    canvas,
    (canvas.width - side) / 2,
    (canvas.height - side) / 2,
    side,
    side,
    0,
    0,
    thumbnailPixels,
    thumbnailPixels
  );

  return thumbnail.toDataURL('image/jpeg', 0.85);
}

/** Thumbnail edge in device pixels: twice its CSS size, for high-density screens. */
const thumbnailPixels = 112;
