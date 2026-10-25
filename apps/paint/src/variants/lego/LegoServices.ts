import { createContext, createMemo, createSignal } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { hexToWheel, wheelToHex, type WheelColor } from '../../features/color-wheel';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import type { PaintSession } from '../../features/session';
import { runPartCommand } from './partCommand';

/**
 * Creates the LEGO capability facade once under the studio owner. Scalar memos stop unrelated brush changes at
 * this boundary. Bindings select props from this facade; looks and controlled components never receive it.
 */
export function createLegoServices(session: PaintSession) {
  const color = createMemo(() => session.brush().color);
  const background = createMemo(() => session.brush().backgroundColor ?? '#ffffff');
  const size = createMemo(() => session.brush().size);
  const opacity = createMemo(() => session.brush().opacity);
  const maxSize = createMemo(() => maxBrushSize(session.brush()));
  const tool = createMemo(session.tool);
  const preset = createMemo(session.tools.preset);
  const hsv = createMemo<Hsv>((previous) =>
    previous && hsvToHex(previous) === color() ? previous : hexToHsv(color(), previous)
  );
  const [intent, setIntent] = createSignal<WheelColor>();
  const wheel = createMemo<WheelColor>((previous) => {
    const requested = intent();
    const hex = color();
    const kept = requested && wheelToHex(requested) === hex ? requested : previous;
    return kept && wheelToHex(kept) === hex ? kept : hexToWheel(hex, kept);
  });

  const symmetryMode = createMemo(() => session.symmetry.symmetry().mode);
  let lastSymmetryMode: Exclude<ReturnType<typeof symmetryMode>, 'off'> = 'vertical';
  const setSymmetryMode = (mode: ReturnType<typeof symmetryMode>) => {
    const current = session.symmetry.symmetry();
    const center = current.mode === 'off' ? session.camera.camera() : current;
    const accepted = session.symmetry.update({
      ...current,
      x: center.x,
      y: center.y,
      mode,
      segments: mode === 'mandala' ? Math.max(3, Math.min(10, current.segments)) : current.segments
    });

    if (accepted && mode !== 'off') {
      lastSymmetryMode = mode;
    }
  };

  const windows: Pick<PaintSession['windows'], 'isOpen' | 'toggle'> = session.windows;

  return {
    brush: { size, opacity, maxSize, update: session.tools.updateBrush },
    color: {
      value: color,
      background,
      hsv,
      set: session.setColor,
      /** Restores a cancelled color edit, deliberately skipping the eraser-to-brush policy. */
      restore: (hex: string) => session.tools.updateBrush({ color: hex }),
      swap: session.tools.swapColors,
      recent: session.recentColors,
      coolorus: session.coolorus,
      oklch: {
        wheel,
        edit(next: WheelColor) {
          setIntent(next);
          session.setColor(wheelToHex(next));
        },
        settle: () => session.recentColors.remember(color()),
        ...session.colorWheel
      }
    },
    tools: { current: tool, preset, toggle: session.toggleTool },
    history: {
      canUndo: createMemo(() => session.engine.state().canUndo && session.ready()),
      canRedo: createMemo(() => session.engine.state().canRedo && session.ready()),
      undo: session.undo,
      redo: session.redo
    },
    windows,
    symmetry: {
      mode: symmetryMode,
      setMode: setSymmetryMode,
      toggle: () => {
        const mode = symmetryMode();

        if (mode !== 'off') {
          lastSymmetryMode = mode;
        }

        setSymmetryMode(mode === 'off' ? lastSymmetryMode : 'off');
      }
    },
    quickShape: {
      enabled: createMemo(() => session.quickShape.settings().enabled),
      toggle: () => session.quickShape.update({ enabled: !session.quickShape.settings().enabled })
    },
    presets: {
      all: session.library.presets,
      resources: session.library.resources,
      recent: () => [preset(), ...session.recentPresets.recent(7)],
      use: session.usePreset,
      async choose(id: string) {
        if (tool() !== 'brush') {
          session.chooseTool('brush');
        }

        await session.choosePreset(id, 'brush');
      }
    },
    transform: { active: session.transform.active, toggle: session.toggleTransform },
    selection: { selected: session.selection.selected },
    layers: {
      wantThumbnails: session.layerThumbnails.want,
      thumbnail: (id: string) => session.layerThumbnails.thumbnail(id)?.src,
      state: session.engine.state,
      ready: session.ready,
      action: (action: Extract<Parameters<PaintSession['edit']>[0], { type: 'layer' }>['action']) =>
        session.edit({ type: 'layer', action }),
      blending: (linear: boolean) => session.edit({ type: 'blending', linear })
    },
    files: {
      ready: session.ready,
      import: (file: File) => session.edit({ type: 'import', file }),
      download: () => session.edit({ type: 'download' }),
      png: () => session.edit({ type: 'png' }),
      psd: () => session.edit({ type: 'psd' }),
      place: session.images.place
    },
    run: (command: () => unknown) => runPartCommand(session, command)
  };
}

/** The inferred capabilities keep their contracts tied to the session and feature factories. */
export type LegoServices = ReturnType<typeof createLegoServices>;

/** One studio scope. Only PartFrame and definition bindings read this context. */
export const LegoServicesContext = createContext<LegoServices>();
