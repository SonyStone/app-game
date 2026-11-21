import { createContext, createMemo, createSignal } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { presetErases, type BrushPreset } from '../../features/brush-library';
import { drawnResources } from '../../features/brush-library/drawnResources';
import { createBrushSettingsEditor } from '../../features/brush/createBrushSettingsEditor';
import { createOwnBrushes } from '../../features/brush/createOwnBrushes';
import { hexToWheel, wheelToHex, type WheelColor } from '../../features/color-wheel';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import type { PaintSession } from '../../features/session';
import { downloadBlob } from '../../shared/downloadBlob';
import { createMockLayers } from './layersPrototype/mockLayers';
import { deviceCell } from './options';
import { runPartCommand } from './partCommand';
import type { WorkspaceControls } from './workspaces';

/**
 * Creates the LEGO capability facade once under the studio owner. Scalar memos stop unrelated brush changes at
 * this boundary. Bindings select props from this facade; looks and controlled components never receive it.
 * `openBrushStudio` is what the "Brush settings" part runs. `openPen` opens the
 * brush studio on its Pen page, where the pen's pressure lives, with the calibration steps started when `measure`.
 * `options` are the editor's own options, which the "Options" part opens (see `PartsTray`): the grid's cell in
 * use, choosing one, opening the sheet, and the workspaces the Workspace part switches between, absent where the host
 * keeps a single board.
 */
export function createLegoServices(
  session: PaintSession,
  openBrushStudio: () => void = () => {},
  openPen: (measure: boolean) => void = () => {},
  openAbr?: () => void,
  options: {
    cell: () => number;
    setCell: (cell: number) => void;
    open: () => void;
    editLayout?: () => void;
    workspaces?: WorkspaceControls;
  } = {
    cell: deviceCell,
    setCell: () => {},
    open: () => {},
    editLayout: () => {}
  }
) {
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
  /** Last enabled mode remembered only for this studio session; defaults to vertical. */
  let sessionSymmetryMode: Exclude<ReturnType<typeof symmetryMode>, 'off'> = 'vertical';
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
      sessionSymmetryMode = mode;
    }
  };

  const windows: Pick<PaintSession['windows'], 'isOpen' | 'toggle'> = session.windows;

  const settings = createBrushSettingsEditor(session);
  const layersPrototype = createMockLayers();
  const own = createOwnBrushes({ library: session.library, tools: session.tools, choose: session.usePreset });

  return {
    brushEditor: { ...settings, open: openBrushStudio },
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
    tools: {
      current: tool,
      preset,
      toggle: session.toggleTool,
      /**
       * The eraser's mode: erasing with the current brush (`clear`) or with its own preset (`preset`); see
       * `createBrushTools`. `canClear` tells whether the brush can erase at all, and `erasesWithBrush` whether it does.
       */
      eraserMode: session.tools.eraserMode,
      canClear: session.tools.canClear,
      erasesWithBrush: session.tools.erasesWithBrush,
      setEraserMode: session.tools.setEraserMode
    },
    history: {
      canUndo: createMemo(() => session.engine.state().canUndo && session.ready()),
      canRedo: createMemo(() => session.engine.state().canRedo && session.ready()),
      undo: session.undo,
      redo: session.redo
    },
    windows,
    /**
     * The pen's pressure curve, the device's calibration that every brush receives pressure through: the curve
     * (straight while uncalibrated), the raw pressure of the pen on the brush studio's pad and the pressures drawn
     * there (`session.penPressure`), and its commands: `open` shows the studio's Pen page, `measure` runs the
     * calibration steps there. Saving the straight line uncalibrates the pen.
     */
    pen: {
      curve: session.pressureCalibration.curve,
      calibrated: () => !!session.pressureCalibration.calibration(),
      marker: session.penPressure.marker,
      measured: session.penPressure.measured,
      save: session.pressureCalibration.save,
      reset: session.pressureCalibration.reset,
      open: () => openPen(false),
      measure: () => openPen(true)
    },
    symmetry: {
      mode: symmetryMode,
      /** Document commands are accepted, including completion of startup preparation. */
      canUpdate: createMemo(session.canUpdateSymmetry),
      setMode: setSymmetryMode,
      toggle: () => {
        const mode = symmetryMode();

        if (mode !== 'off') {
          sessionSymmetryMode = mode;
        }

        setSymmetryMode(mode === 'off' ? sessionSymmetryMode : 'off');
      }
    },
    quickShape: {
      enabled: createMemo(() => session.quickShape.settings().enabled),
      toggle: () => session.quickShape.update({ enabled: !session.quickShape.settings().enabled })
    },
    presets: {
      ...(openAbr && { openAbr }),
      /** The brushes that can be chosen: the library's, less those being deleted. */
      all: () => session.library.presets().filter((preset) => !own.deleting().has(preset.id)),
      /** The library's brushes, those being deleted included, as the brush library lists them. */
      listed: session.library.presets,
      async importFile(file: File) {
        const { importPaintbrush } = await import('../../features/brush-library/paintbrushFile');
        const rejected = await importPaintbrush(new Uint8Array(await file.arrayBuffer()), session.library);
        if (rejected.length) {
          throw new Error(rejected.join('\n'));
        }
      },
      async exportFile(id: string) {
        const selected = session.library.find(id);
        if (!selected) {
          throw new Error('Brush no longer exists');
        }
        const images = await (selected.abrDocument
          ? session.library.assets(selected)
          : session.library.resources(selected));
        if (images.isErr()) {
          throw new Error(images.error.message);
        }
        const { exportPaintbrush } = await import('../../features/brush-library/paintbrushFile');
        const bytes = await exportPaintbrush(selected, images.value);
        downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), selected.name + '.paintbrush');
      },
      /** A preset's images for its sample as it draws now, the images of its edit in the studio included. */
      resources: (preset: BrushPreset) => drawnResources(session.library, session.tools.editedResources, preset),
      /** `preset` as it draws now, with its changes and its edit in the studio; see `asDrawn`. Reactive. */
      drawn: session.tools.asDrawn,
      /** Whether preset `id` differs from its saved state; reactive. */
      modified: session.tools.modified,
      recent: () => [preset(), ...session.recentPresets.recent(7)],
      use: session.usePreset,
      /** Renaming and undoable deleting of the user's own brushes; see `createOwnBrushes`. */
      own,
      /**
       * Paints with preset `id` on the brush tool, choosing that tool; a preset that erases (`presetErases`) goes to the
       * eraser tool instead, so the brush never turns into an eraser.
       */
      async choose(id: string) {
        const chosen = session.library.find(id);
        const slot = chosen && presetErases(chosen) ? 'eraser' : 'brush';
        if (tool() !== slot) {
          session.chooseTool(slot);
        }

        await session.choosePreset(id, slot);
      }
    },
    /**
     * The canvas view: the zoom (1 is 100%) and the rotation in radians with their resets, and full screen, which is
     * `available` only where the browser offers it and the app does not already run full screen.
     */
    view: {
      zoom: createMemo(() => session.camera.camera().zoom),
      angle: createMemo(() => session.camera.camera().angle),
      resetZoom: session.camera.resetZoom,
      resetRotation: session.camera.resetRotation,
      fullscreen: {
        available: () => session.fullscreen.shown && !session.fullscreen.props.disabled,
        active: session.fullscreen.isActive,
        toggle: session.fullscreen.props.onClick
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
    /** Self-contained PSD layers UI prototype state for `layers:strip-prototype` and the canvas's red mask overlay. */
    layersPrototype,
    files: {
      ready: session.ready,
      import: (file: File) => session.edit({ type: 'import', file }),
      download: () => session.edit({ type: 'download' }),
      png: () => session.edit({ type: 'png' }),
      psd: () => session.edit({ type: 'psd' }),
      place: session.images.place
    },
    options: {
      ...options,
      editLayout: options.editLayout ?? (() => {})
    },
    run: (command: () => unknown) => runPartCommand(session, command)
  };
}

/** The inferred capabilities keep their contracts tied to the session and feature factories. */
export type LegoServices = ReturnType<typeof createLegoServices>;

/** One studio scope. Only PartFrame and definition bindings read this context. */
export const LegoServicesContext = createContext<LegoServices>();
