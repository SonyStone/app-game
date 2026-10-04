import type { Camera, ViewSize } from '@app-game/paint-core/camera';
import type { DocumentRect } from '@app-game/paint-core/layersInView';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { createEffect, createMemo, latest, untrack, type Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { framesFeature, type Frame, type FramesData } from './framesFeature';

/**
 * The UI half of the frames module, whose engine half is `framesFeature`: named rectangles on the canvas, saved with
 * the document, and the active frame, which the Layers panel lists layers of and a link names. Frames reset to those
 * of a document the engine loads. The engine watches the active frame's region, so that its state reports the layers
 * with paint in it. A page opened with `#frame=<id>` activates that frame and shows it once the document has it.
 * Must be created within a Solid owner.
 */
export function createFrames(options: {
  /** Feature data of the loaded document; without frame data the current frames stay. */
  restored: Accessor<Readonly<Record<string, unknown>> | undefined>;
  /** Whether document commands are accepted. */
  canUpdate: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'feature' | 'watch-regions' }>) => void;
  /** Moves the view, for `goTo`. */
  navigate: (camera: Camera) => void;
  camera: Accessor<Camera>;
  size: Accessor<ViewSize>;
}) {
  const [data, setData, currentData] = createImmediateSignal<FramesData>(
    framesFeature.read(untrack(options.restored)) ?? { frames: [] }
  );
  // A loaded document brings its own frames.
  createEffect(options.restored, (restored) => {
    const frames = framesFeature.read(restored);
    if (frames) {
      setData(frames);
    }
  });
  const activeFrame = createMemo(() => data().frames.find((frame) => frame.id === data().active));
  /** The frame a link named, until it is shown. */
  let linked = linkedFrame();
  createEffect(
    () => (linked !== undefined && options.canUpdate() ? data().frames.some((frame) => frame.id === linked) : false),
    (found) => {
      if (found && linked !== undefined) {
        const id = linked;
        linked = undefined;
        change({ ...currentData(), active: id });
        goTo(id);
      }
    }
  );
  // The engine reports the layers with paint in the active frame; a new engine is told again once it accepts commands.
  createEffect(
    () => (options.canUpdate() ? { frame: activeFrame() } : undefined),
    (current) => {
      if (current) {
        options.send({ type: 'watch-regions', regions: current.frame ? { [frameRegion]: rect(current.frame) } : {} });
      }
    }
  );

  return {
    frames: () => data().frames,
    activeFrame,
    /** Adds a frame covering the view, upright, and makes it active. Returns it, or nothing while commands wait. */
    addFromView(): Frame | undefined {
      const camera = latest(options.camera),
        size = latest(options.size);
      const width = Math.round(size.width / camera.zoom),
        height = Math.round(size.height / camera.zoom);
      const frame: Frame = {
        id: crypto.randomUUID(),
        name: nextName(currentData().frames),
        left: Math.round(camera.x - width / 2),
        top: Math.round(camera.y - height / 2),
        width,
        height
      };
      return change({ frames: [...currentData().frames, frame], active: frame.id }) ? frame : undefined;
    },
    /** Makes `id` the active frame, or none for the whole canvas. */
    activate: (id: string | undefined) => change({ ...currentData(), active: id }),
    rename(id: string, name: string) {
      const trimmed = name.trim().slice(0, 64);
      return (
        trimmed !== '' &&
        change({
          ...currentData(),
          frames: currentData().frames.map((frame) => (frame.id === id ? { ...frame, name: trimmed } : frame))
        })
      );
    },
    /** Gives frame `id` a new rectangle, in whole document pixels of at least one per side. */
    resize(id: string, rect: DocumentRect) {
      const left = Math.round(rect.left),
        top = Math.round(rect.top);
      const width = Math.max(1, Math.round(rect.left + rect.width) - left),
        height = Math.max(1, Math.round(rect.top + rect.height) - top);
      return change({
        ...currentData(),
        frames: currentData().frames.map((frame) => (frame.id === id ? { ...frame, left, top, width, height } : frame))
      });
    },
    remove(id: string) {
      const { frames, active } = currentData();
      return change({ frames: frames.filter((frame) => frame.id !== id), active: active === id ? undefined : active });
    },
    goTo,
    /** A link to this page that opens frame `id`; frames live in this device's document, so only here. */
    linkTo: (id: string) => `${location.origin}${location.pathname}${location.search}#frame=${encodeURIComponent(id)}`
  };

  /** Fits frame `id` in the view, upright, with a margin. */
  function goTo(id: string) {
    const frame = currentData().frames.find((candidate) => candidate.id === id);
    if (!frame) {
      return;
    }

    const size = latest(options.size);
    options.navigate({
      ...latest(options.camera),
      x: frame.left + frame.width / 2,
      y: frame.top + frame.height / 2,
      zoom: Math.min(size.width / frame.width, size.height / frame.height) * 0.9,
      angle: 0
    });
  }

  /** Replaces the frames; returns false, changing nothing, while document commands are suspended. */
  function change(next: FramesData): boolean {
    if (!latest(options.canUpdate)) {
      return false;
    }

    const command = framesFeature.command(next);
    setData(command.command);
    options.send(command);
    return true;
  }
}

/** The frames module's state and commands. */
export type Frames = ReturnType<typeof createFrames>;

/** The region name under which the engine reports the layers in the active frame. */
export const frameRegion = 'frame';

/** The frame id in the page's `#frame=<id>` link, if any. */
function linkedFrame() {
  const encoded = typeof location === 'undefined' ? undefined : /^#frame=(.+)$/.exec(location.hash)?.[1];
  try {
    return encoded === undefined ? undefined : decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

/** A frame's rectangle. */
function rect({ left, top, width, height }: Frame): DocumentRect {
  return { left, top, width, height };
}

/** `Frame N` with the smallest N not yet used. */
function nextName(frames: readonly Frame[]) {
  const names = new Set(frames.map((frame) => frame.name));
  let index = 1;
  while (names.has(`Frame ${index}`)) {
    index++;
  }

  return `Frame ${index}`;
}
