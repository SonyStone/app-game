import { createSignal } from 'solid-js';
import { hexToHsv, hsvToHex } from '../../../features/color/hsv';
import { defaultValues, presets, tools, toolSettings, type Setting, type SettingValue, type ToolId } from './catalog';
import { createSketchCanvas, type Point } from './createSketchCanvas';

/**
 * The gallery's mock editor, shared by every variant: the drawing and its view, the tool, each tool's settings, the
 * color with the previous and recent colors, brush presets, layers, history and short notices. Variants only present
 * these; switching variants keeps the work. Must be created within a Solid owner.
 *
 * The stage feeds pointer input to `press`, `drag` and `lift`: brush, mixer and eraser paint into the active layer,
 * the color picker samples the drawing, and other tools only say that they are for show.
 */
export function createStudio() {
  const canvas = createSketchCanvas();
  const [tool, setTool] = createSignal<ToolId>('brush');
  const [values, setValues] = createSignal(defaultValues);
  const [preset, setPreset] = createSignal<string | undefined>('g-pen');
  const [color, setColorSignal] = createSignal('#2d5a7b');
  const [committed, setCommitted] = createSignal('#2d5a7b');
  const [previous, setPrevious] = createSignal('#d9773c');
  const [recent, setRecent] = createSignal<readonly string[]>(startingRecent);
  const [symmetry, setSymmetry] = createSignal(false);
  const [notice, setNotice] = createSignal<{ text: string; serial: number }>();
  /** The color picker's press in progress. */
  let picking: number | undefined;
  let noticeSerial = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const value = (key: string, of: ToolId = tool()) => values()[of][key];
  const number = (key: string, of: ToolId = tool()) => {
    const found = value(key, of);
    return typeof found === 'number' ? found : 0;
  };

  const studio = {
    canvas,

    tool,
    /** Chooses a tool; tools are listed in `tools` from the catalog. */
    setTool,
    /** The current tool's description from the catalog. */
    toolInfo: () => tools.find((entry) => entry.id === tool())!,
    /** The current tool's settings, in display order. */
    settings: (): readonly Setting[] => toolSettings[tool()],
    /** A setting's value for the current tool, or for `of`. */
    value,
    /** A numeric setting's value, 0 when the setting is missing. */
    number,
    /**
     * Sets a setting of the current tool (or of `of`). Live previews call it on every move; there is no separate
     * commit for settings.
     */
    setValue(key: string, next: SettingValue, of: ToolId = tool()) {
      setValues((all) => ({ ...all, [of]: { ...all[of], [key]: next } }));
    },

    preset,
    /** Applies a brush preset: switches to its tool and sets that tool's settings. */
    choosePreset(id: string) {
      const chosen = presets.find((entry) => entry.id === id);
      if (!chosen) {
        return;
      }

      setTool(chosen.tool);
      setValues((all) => ({ ...all, [chosen.tool]: { ...all[chosen.tool], ...chosen.values } }));
      setPreset(id);
    },

    /** The current color, `#rrggbb`; follows live edits. */
    color,
    /** The color before the last committed change; tapping it in a panel swaps the two. */
    previous,
    /** Recently committed colors, newest first, up to 12. */
    recent,
    /** Sets the color live, during a drag; `commitColor` ends the edit. */
    setColor: (next: string) => setColorSignal(next),
    /**
     * Ends a color edit: the color before it becomes the previous color and the new one joins the recent colors. Call
     * it in a later event than the last `setColor` (a drag's lift), or use `chooseColor`: a signal read right after its
     * write in the same event still returns the old color.
     */
    commitColor: () => commit(color()),
    /** Sets and commits a color at once, as a swatch tap does. */
    chooseColor(next: string) {
      setColorSignal(next);
      commit(next);
    },
    /** Swaps the current and previous colors. */
    swapColors() {
      const before = committed();
      const other = previous();
      setColorSignal(other);
      setCommitted(other);
      setPrevious(before);
    },
    /** The current color in HSV, for pickers; `hsvToHex` converts back. */
    hsv: () => hexToHsv(color()),
    hsvToHex,

    symmetry,
    toggleSymmetry: () => setSymmetry((on) => !on),

    /** Layers, from the top down. */
    layers: canvas.layers,
    activeLayer: canvas.activeLayer,
    selectLayer: canvas.selectLayer,
    updateLayer: canvas.updateLayer,
    addLayer: canvas.addLayer,
    duplicateLayer: canvas.duplicateLayer,
    deleteLayer: canvas.deleteLayer,
    moveLayer: canvas.moveLayer,

    undo: canvas.undo,
    redo: canvas.redo,
    canUndo: () => canvas.history().done > 0,
    canRedo: () => canvas.history().undone > 0,
    /** How many strokes can be undone and redone, for history scrubbers. */
    history: canvas.history,

    view: canvas.view,
    pan: canvas.pan,
    gesture: canvas.gesture,
    zoomBy: canvas.zoomBy,
    zoomTo: canvas.zoomTo,
    rotateBy: canvas.rotateBy,
    rotateTo: canvas.rotateTo,
    flip: canvas.flip,
    fit: canvas.fit,

    /** A short message for the bottom of the screen, such as "Lasso: for show only". */
    notice,
    notify(text: string) {
      noticeSerial += 1;
      setNotice({ text, serial: noticeSerial });
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => setNotice(undefined), 1800);
    },

    /**
     * A pen or mouse press on the drawing: the current tool starts working. Returns whether it took the press, so
     * that the stage keeps feeding it `drag` and `lift`.
     */
    press(event: PointerEvent) {
      const current = tool();
      if (current === 'picker') {
        picking = event.pointerId;
        pick(event);
        return true;
      }

      const info = tools.find((entry) => entry.id === current)!;
      if (!info.paints) {
        studio.notify(`${info.label}: only its settings work in this mockup`);
        return false;
      }

      const layer = canvas.layers().find((entry) => entry.id === canvas.activeLayer());
      if (layer?.locked) {
        studio.notify(`${layer.name} is locked`);
        return false;
      }

      if (layer && !layer.visible) {
        studio.notify(`${layer.name} is hidden`);
        return false;
      }

      const mixing = current === 'mixer' ? canvas.colorAt({ x: event.clientX, y: event.clientY }) : undefined;
      return canvas.begin(event, {
        erase: current === 'eraser',
        // The mixer picks up the paint under the press and blends it with the brush color.
        color: mixing ? mix(color(), mixing, number('wet', 'mixer') / 100) : color(),
        size: number('size'),
        opacity: number('opacity'),
        hardness: number('hardness'),
        smoothing: number('smoothing') / 100,
        pressureSize: value('pressureSize') === true,
        mirror: symmetry()
      });
    },
    drag(event: PointerEvent) {
      if (picking === event.pointerId) {
        pick(event);
        return;
      }

      canvas.extend(event);
    },
    lift(event: PointerEvent) {
      if (picking === event.pointerId) {
        picking = undefined;
        commit(color());
        return;
      }

      canvas.end(event);
    },
    /** Whether a stroke or a color pick is in progress. */
    working: () => canvas.drawing()
  };

  return studio;

  /** Commits `next`, the color just set; it is passed in because reading the signal in the same event reads stale. */
  function commit(next: string) {
    if (next === committed()) {
      return;
    }

    setPrevious(committed());
    setCommitted(next);
    setRecent((list) => [next, ...list.filter((entry) => entry !== next)].slice(0, 12));
  }

  function pick(event: PointerEvent) {
    const sampled = canvas.colorAt({ x: event.clientX, y: event.clientY } satisfies Point);
    if (sampled) {
      setColorSignal(sampled);
    }
  }
}

/** The mock editor's state and commands, as variants receive them. */
export type Studio = ReturnType<typeof createStudio>;

const startingRecent = ['#2d5a7b', '#d9773c', '#262329', '#e6b93d', '#c4463a', '#7aa05a', '#efeae1', '#5a4e9a'];

/** Mixes two `#rrggbb` colors; `amount` 0 gives `a`, 1 gives `b`. */
function mix(a: string, b: string, amount: number) {
  const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const from = channels(a);
  const to = channels(b);
  return `#${from
    .map((channel, index) =>
      Math.round(channel + (to[index]! - channel) * amount)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
