import { createMemo, createSignal, onCleanup } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../../../features/color/hsv';
import { presets, tools, type Setting, type SettingValue, type ToolId } from '../../kit/catalog';
import { blendLabel, blendModes, type Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { formatValue, fractionOf, stepPreset, type NumberSetting } from '../../kit/values';
import { turnBetween } from './geometry';

/** The dial's modes in ring order, clockwise from 12 o'clock; the digit keys pick them. */
export const modes = [
  { id: 'size', label: 'Size', icon: 'size', key: '1' },
  { id: 'opacity', label: 'Opacity', icon: 'opacity', key: '2' },
  { id: 'tune', label: 'Setting', icon: 'tune', key: '3' },
  { id: 'color', label: 'Color', icon: 'drop', key: '4' },
  { id: 'brush', label: 'Brush', icon: 'brush', key: '5' },
  { id: 'tool', label: 'Tool', icon: 'tools', key: '6' },
  { id: 'layer', label: 'Layer', icon: 'layers', key: '7' },
  { id: 'history', label: 'History', icon: 'history', key: '8' },
  { id: 'zoom', label: 'Zoom', icon: 'zoom', key: '9' },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', key: '0' }
] as const;

export type ModeId = (typeof modes)[number]['id'];

/** What the Color mode turns: hue, saturation or value. */
export type Channel = 'h' | 's' | 'v';

/** What the Layer mode turns: which layer is active, its opacity or its blend mode. */
export type LayerPart = 'pick' | 'opacity' | 'blend';

/**
 * The Dial's state and its one verb, turning. A mode chooses what the dial adjusts (Setting, Color and Layer have a
 * sub-target: which setting, which channel, which layer property); turning moves it by detents, one preset, tool,
 * layer, stroke of history or 15° each. Zoom and Rotate turn continuously, with soft stops. Must be created within
 * a Solid owner.
 *
 * Input comes in two forms: a press-drag around the center (`turnStart`, `turnBy` with the swept angle, `turnEnd`)
 * and single detents from keys, the wheel and taps (`step`). Both report detents through `feedback`, so that the
 * dial can pulse, and turn the virtual knob, `knurl`.
 */
export function createDialModel(studio: Studio) {
  const [mode, setModeSignal] = createSignal<ModeId>('size');
  const [tuneKeys, setTuneKeys] = createSignal<Partial<Record<ToolId, string>>>({});
  const [channel, setChannelSignal] = createSignal<Channel>('h');
  const [layerPart, setLayerPartSignal] = createSignal<LayerPart>('pick');
  /** The HSV the dial set last; kept while the color still matches, so that a gray keeps its hue as it turns. */
  const [intended, setIntended] = createSignal<Hsv>();
  const [knurl, setKnurl] = createSignal(0);
  const [feedback, setFeedback] = createSignal<{ serial: number; kind: 'tick' | 'bump' }>({ serial: 0, kind: 'tick' });
  /** The knob's angle at rest: whole detents turned so far. */
  let knurlBase = 0;
  let session: Session | undefined;
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(commitTimer));

  const hsv = createMemo<Hsv>((previous) => {
    const hex = studio.color();
    const wanted = intended();
    return wanted && hsvToHex(wanted) === hex ? wanted : hexToHsv(hex, previous);
  });
  /** The current tool's settings that the Setting mode can turn: all but size and opacity, which have modes. */
  const tunable = () => studio.settings().filter((entry) => entry.key !== 'size' && entry.key !== 'opacity');
  const tuneSetting = () => {
    const list = tunable();
    const key = tuneKeys()[studio.tool()];
    return list.find((entry) => entry.key === key) ?? list[0];
  };
  /** The setting that the size, opacity or Setting mode turns, if the current tool has it. */
  const modeSetting = (of: ModeId = mode()): Setting | undefined => {
    if (of === 'tune') {
      return tuneSetting();
    }

    return of === 'size' || of === 'opacity' ? studio.settings().find((entry) => entry.key === of) : undefined;
  };
  const activeLayer = () => studio.layers().find((entry) => entry.id === studio.activeLayer());

  /** Degrees of turning per detent for the current mode. */
  const detent = () => {
    switch (mode()) {
      case 'size':
      case 'opacity':
      case 'tune':
        return modeSetting()?.kind === 'number' ? 15 : 30;
      case 'color':
        return 10;
      case 'layer':
        return layerPart() === 'opacity' ? 15 : layerPart() === 'blend' ? 24 : 30;
      case 'history':
        return 20;
      case 'rotate':
        return 15;
      default:
        return 30;
    }
  };
  /** Whether turning follows the pointer smoothly (with soft stops) rather than jumping by detents. */
  const continuous = () => mode() === 'zoom' || mode() === 'rotate';

  const track = createMemo<Track>(() => {
    switch (mode()) {
      case 'size':
      case 'opacity':
      case 'tune': {
        const setting = modeSetting();
        return setting ? settingTrack(setting, studio.value(setting.key)) : emptyTrack;
      }
      case 'color':
        return colorTrack(channel(), hsv());
      case 'brush':
        return listTrack(
          presets.length,
          presets.findIndex((entry) => entry.id === studio.preset())
        );
      case 'tool':
        return listTrack(
          tools.length,
          tools.findIndex((entry) => entry.id === studio.tool())
        );
      case 'layer': {
        const layer = activeLayer();
        if (layerPart() === 'opacity') {
          return settingTrack(layerOpacity, layer?.opacity ?? 0);
        }

        if (layerPart() === 'blend') {
          return listTrack(blendModes.length, layer ? blendModes.indexOf(layer.blend) : -1);
        }

        return listTrack(
          studio.layers().length,
          studio.layers().findIndex((entry) => entry.id === studio.activeLayer())
        );
      }
      case 'history': {
        const { done, undone } = studio.history();
        const total = done + undone;
        return {
          shape: 'arc',
          ticks: total > 0 && total <= 60 ? Array.from({ length: total + 1 }, (_, index) => index / total) : [],
          majors: [0, 1],
          at: total > 0 ? done / total : 1,
          level: true
        };
      }
      case 'zoom':
        return {
          shape: 'arc',
          ticks: zoomStops.map(zoomFraction),
          majors: [0.25, 1, 4].map(zoomFraction),
          at: zoomFraction(studio.view().scale),
          level: true
        };
      case 'rotate': {
        const angle = studio.view().angle;
        return {
          shape: 'circle',
          ticks: Array.from({ length: 24 }, (_, index) => index / 24),
          majors: [0, 0.25, 0.5, 0.75],
          at: (((angle % 360) + 360) % 360) / 360,
          level: false
        };
      }
    }
  });

  const readout = createMemo<Readout>(() => {
    switch (mode()) {
      case 'size':
      case 'opacity':
      case 'tune': {
        const setting = modeSetting();
        if (!setting) {
          return {
            label: modes.find((entry) => entry.id === mode())!.label,
            value: '—',
            unit: '',
            note: `not for ${studio.toolInfo().label}`
          };
        }

        return { label: setting.label, ...settingText(setting, studio.value(setting.key)), note: '' };
      }
      case 'color': {
        const { h, s, v } = hsv();
        const label = channel() === 'h' ? 'Hue' : channel() === 's' ? 'Saturation' : 'Value';
        const value = channel() === 'h' ? Math.round(h) : Math.round((channel() === 's' ? s : v) * 100);
        return { label, value: `${value}`, unit: channel() === 'h' ? '°' : '%', note: studio.color() };
      }
      case 'brush': {
        const chosen = presets.find((entry) => entry.id === studio.preset());
        return { label: 'Brush', value: chosen?.name ?? '—', unit: '', note: chosen?.set ?? '' };
      }
      case 'tool':
        return { label: 'Tool', value: studio.toolInfo().label, unit: '', note: `key ${studio.toolInfo().key}` };
      case 'layer': {
        const layer = activeLayer();
        const list = studio.layers();
        if (!layer) {
          return { label: 'Layer', value: '—', unit: '', note: '' };
        }

        if (layerPart() === 'opacity') {
          return { label: 'Layer opacity', value: `${layer.opacity}`, unit: '%', note: layer.name };
        }

        if (layerPart() === 'blend') {
          return { label: 'Blend', value: blendLabel(layer.blend), unit: '', note: layer.name };
        }

        return {
          label: 'Layer',
          value: layer.name,
          unit: '',
          note: `${list.indexOf(layer) + 1} of ${list.length}`
        };
      }
      case 'history': {
        const { done, undone } = studio.history();
        return {
          label: 'History',
          value: `${done}`,
          unit: `/ ${done + undone}`,
          note: done + undone === 0 ? 'no strokes yet' : undone > 0 ? `redo ${undone} ▸` : '◂ undo'
        };
      }
      case 'zoom':
        return { label: 'Zoom', value: `${Math.round(studio.view().scale * 100)}`, unit: '%', note: '' };
      case 'rotate':
        return {
          label: 'Rotate',
          value: `${Math.round(studio.view().angle)}`,
          unit: '°',
          note: studio.view().flipped ? 'flipped' : ''
        };
    }
  });

  return {
    mode,
    /** Switches what the dial turns; ends a pending color edit first. */
    setMode(next: ModeId) {
      commitNow();
      setModeSignal(next);
    },
    /** Moves to the next (`by` 1) or previous (−1) mode on the ring that the current tool supports. */
    stepMode(by: 1 | -1) {
      const start = modes.findIndex((entry) => entry.id === mode());
      for (let offset = 1; offset <= modes.length; offset++) {
        const candidate = modes[(start + by * offset + modes.length * 2) % modes.length]!;
        if (available(candidate.id)) {
          commitNow();
          setModeSignal(candidate.id);
          return;
        }
      }
    },
    /** Whether the current tool has what a mode turns; only size and opacity can be missing. */
    available,
    /** The setting that the size, opacity or Setting mode turns, if the tool has it. */
    modeSetting,
    /** Makes the dial turn one of the current tool's settings, choosing the mode that holds it. */
    target(key: string) {
      commitNow();
      if (key === 'size' || key === 'opacity') {
        setModeSignal(key);
        return;
      }

      setTuneKeys((all) => ({ ...all, [studio.tool()]: key }));
      setModeSignal('tune');
    },
    /** The key of the setting that the Setting mode turns for the current tool. */
    tuneKey: () => tuneSetting()?.key,
    channel,
    /** Chooses the color channel and switches to the Color mode. */
    setChannel(next: Channel) {
      setChannelSignal(next);
      setModeSignal('color');
    },
    layerPart,
    /** Chooses what the Layer mode turns and switches to it. */
    setLayerPart(next: LayerPart) {
      setLayerPartSignal(next);
      setModeSignal('layer');
    },
    /** The current color in HSV, keeping hue and saturation through grays. */
    hsv,
    /** Sets the color live from HSV, as pickers do; the caller commits it (`studio.commitColor`). */
    setHsv(next: Hsv) {
      setIntended(next);
      studio.setColor(hsvToHex(next));
    },
    detent,
    continuous,
    /** The track around the readout: its stops and where the indicator points. */
    track,
    /** The readout's text: what is turned, its value and a short note. */
    readout,
    /** The virtual knob's angle in degrees: it follows the pointer and settles on detents. */
    knurl,
    /** A new value each time a detent passes (`tick`) or turning hits an end (`bump`). */
    feedback,

    /** Starts turning by a press around `pivot`, the dial's center (zoom and rotation pivot there). */
    turnStart(pivot: Point) {
      const view = studio.view();
      session = {
        pivot,
        residual: 0,
        total: 0,
        turned: false,
        scale: view.scale,
        angle: view.angle,
        stop: mode() === 'zoom' ? zoomStopIndex(view.scale) : Math.round(view.angle / 15)
      };
    },
    /** Turns by `degrees` swept around the center since the last call; positive is clockwise. */
    turnBy(degrees: number) {
      if (!session) {
        return;
      }

      if (continuous()) {
        session.total += degrees;
        session.turned = true;
        setKnurl(knurlBase + session.total);
        if (sweep(session)) {
          signal('tick');
        }

        return;
      }

      // A detent clicks at 0.7 of its angle and leaves the rest owed: steps stay one detent apart, and turning back
      // takes 0.4 of a detent, so that a trembling pen cannot rattle between two values.
      session.residual += degrees;
      const unit = detent();
      let steps = 0;
      while (session.residual >= unit * 0.7) {
        steps += 1;
        session.residual -= unit;
      }

      while (session.residual <= -unit * 0.7) {
        steps -= 1;
        session.residual += unit;
      }

      if (steps !== 0) {
        session.turned = true;
        turnSteps(steps, session.pivot, unit);
      }

      setKnurl(knurlBase + session.residual * 0.3);
    },
    /** Ends turning; commits a color edit. Returns whether anything turned. */
    turnEnd() {
      if (!session) {
        return false;
      }

      const { turned, total } = session;
      if (continuous()) {
        knurlBase += total;
      }

      session = undefined;
      setKnurl(knurlBase);
      commitNow();
      return turned;
    },
    /** Turns by whole detents, as keys, the wheel and taps on the track do; zoom and rotation pivot at `pivot`. */
    step(steps: number, pivot: Point) {
      if (steps === 0) {
        return;
      }

      turnSteps(steps, pivot, detent());
      setKnurl(knurlBase);
      if (mode() === 'color') {
        clearTimeout(commitTimer);
        commitTimer = setTimeout(commitNow, 700);
      }
    },
    /** Commits a pending color edit now, as closing the dial does. */
    commit: () => commitNow()
  };

  function available(id: ModeId) {
    if (id === 'size' || id === 'opacity') {
      return studio.settings().some((entry) => entry.key === id);
    }

    return id !== 'tune' || tunable().length > 0;
  }

  /** Applies `steps` detents and reports them: a tick when something changed, a bump at an end. */
  function turnSteps(steps: number, pivot: Point, unit: number) {
    if (apply(steps, pivot)) {
      knurlBase += steps * unit;
      signal('tick');
    } else {
      signal('bump');
    }
  }

  function signal(kind: 'tick' | 'bump') {
    setFeedback((last) => ({ serial: last.serial + 1, kind }));
  }

  function commitNow() {
    clearTimeout(commitTimer);
    commitTimer = undefined;
    studio.commitColor();
  }

  /**
   * Moves the current mode's target by `steps` detents. Reads every value once: in Solid a signal read after its
   * write in the same handler still returns the old value, so several steps are applied as one.
   */
  function apply(steps: number, pivot: Point): boolean {
    switch (mode()) {
      case 'size':
      case 'opacity':
      case 'tune': {
        const setting = modeSetting();
        if (!setting) {
          return false;
        }

        const value = studio.value(setting.key);
        const next = stepSetting(setting, value, steps);
        if (next === undefined || next === value) {
          return false;
        }

        studio.setValue(setting.key, next);
        return true;
      }
      case 'color': {
        const current = hsv();
        const which = channel();
        const next: Hsv = {
          h: which === 'h' ? (((current.h + steps * 10) % 360) + 360) % 360 : current.h,
          s: which === 's' ? clampUnit(current.s + steps * 0.04) : current.s,
          v: which === 'v' ? clampUnit(current.v + steps * 0.04) : current.v
        };
        if (next.h === current.h && next.s === current.s && next.v === current.v) {
          return false;
        }

        setIntended(next);
        studio.setColor(hsvToHex(next));
        return true;
      }
      case 'brush': {
        const index = presets.findIndex((entry) => entry.id === studio.preset());
        const from = index < 0 ? (steps > 0 ? -1 : presets.length) : index;
        const next = Math.min(presets.length - 1, Math.max(0, from + steps));
        if (next === index) {
          return false;
        }

        studio.choosePreset(presets[next]!.id);
        return true;
      }
      case 'tool': {
        const index = tools.findIndex((entry) => entry.id === studio.tool());
        const next = Math.min(tools.length - 1, Math.max(0, index + steps));
        if (next === index) {
          return false;
        }

        studio.setTool(tools[next]!.id);
        return true;
      }
      case 'layer':
        return stepLayer(steps);
      case 'history': {
        const { done, undone } = studio.history();
        const count = steps > 0 ? Math.min(steps, undone) : Math.min(-steps, done);
        for (let index = 0; index < count; index++) {
          if (steps > 0) {
            studio.redo();
          } else {
            studio.undo();
          }
        }

        return count > 0;
      }
      case 'zoom': {
        const scale = studio.view().scale;
        const stop =
          steps > 0
            ? (zoomStops.find((entry) => entry > scale * 1.001) ?? 16)
            : (zoomStops.findLast((entry) => entry < scale / 1.001) ?? 0.05);
        if (Math.abs(stop - scale) < 1e-6) {
          return false;
        }

        studio.zoomTo(stop, pivot);
        return true;
      }
      case 'rotate': {
        const angle = studio.view().angle;
        const target = (steps > 0 ? Math.floor(angle / 15 + 1e-6) : Math.ceil(angle / 15 - 1e-6)) * 15 + steps * 15;
        studio.rotateBy(turnBetween(angle, target), pivot);
        return true;
      }
    }
  }

  function stepLayer(steps: number) {
    const list = studio.layers();
    const layer = activeLayer();
    if (!layer) {
      return false;
    }

    if (layerPart() === 'opacity') {
      const next = stepPreset(layerOpacity, layer.opacity, steps);
      if (next === layer.opacity) {
        return false;
      }

      studio.updateLayer(layer.id, { opacity: next });
      return true;
    }

    if (layerPart() === 'blend') {
      const index = blendModes.indexOf(layer.blend);
      const next = Math.min(blendModes.length - 1, Math.max(0, index + steps));
      if (next === index) {
        return false;
      }

      studio.updateLayer(layer.id, { blend: blendModes[next]! });
      return true;
    }

    const index = list.indexOf(layer);
    const next = Math.min(list.length - 1, Math.max(0, index + steps));
    if (next === index) {
      return false;
    }

    studio.selectLayer(list[next]!.id);
    return true;
  }

  /**
   * Applies a continuous turn: zoom doubles every 120°; rotation follows the pointer one to one and settles on
   * multiples of 15° within 4° of them. Returns whether a zoom stop or a 15° mark was passed.
   */
  function sweep(active: Session) {
    if (mode() === 'zoom') {
      const scale = Math.min(16, Math.max(0.05, active.scale * 2 ** (active.total / 120)));
      studio.zoomTo(scale, active.pivot);
      const stop = zoomStopIndex(scale);
      const passed = stop !== active.stop;
      active.stop = stop;
      return passed;
    }

    const raw = active.angle + active.total;
    const nearest = Math.round(raw / 15) * 15;
    const target = Math.abs(raw - nearest) < 4 ? nearest : raw;
    studio.rotateBy(turnBetween(studio.view().angle, target), active.pivot);
    const stop = Math.round(raw / 15);
    const passed = stop !== active.stop;
    active.stop = stop;
    return passed;
  }
}

/** The dial's state and commands, as the variant's parts receive them. */
export type DialModel = ReturnType<typeof createDialModel>;

/** A press-drag turn in progress. */
type Session = {
  pivot: Point;
  /** Degrees turned since the last detent, for detented modes. */
  residual: number;
  /** Degrees turned since the press, for continuous modes. */
  total: number;
  turned: boolean;
  /** The view's zoom and angle at the press. */
  scale: number;
  angle: number;
  /** The zoom stop or 15° mark last passed. */
  stop: number;
};

/**
 * The track around the readout. `ticks`, `majors` and `at` are fractions of the track: an open arc from 7:30 to 4:30
 * for ranges and lists, or a full circle for hue and rotation.
 */
export type Track = {
  shape: 'arc' | 'circle';
  ticks: readonly number[];
  /** Stops drawn longer. */
  majors: readonly number[];
  /** Where the indicator points, or `undefined` when the value is on no stop (no preset chosen). */
  at: number | undefined;
  /** Whether the track fills from its start to the indicator, as a level does. */
  level: boolean;
  /** Colors painting the track from start to end, for the color channels. */
  colors?: readonly string[];
};

/** The readout's text. */
export type Readout = { label: string; value: string; unit: string; note: string };

/** Zoom stops that wheel and key steps land on and that turning ticks at. */
const zoomStops = [0.05, 0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

/** A layer's opacity, stepped like a tool's percent settings. */
const layerOpacity: NumberSetting = {
  kind: 'number',
  key: 'layerOpacity',
  label: 'Layer opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]
};

const emptyTrack: Track = { shape: 'arc', ticks: [], majors: [], at: undefined, level: false };

function settingTrack(setting: Setting, value: SettingValue | undefined): Track {
  if (setting.kind === 'number') {
    const number = typeof value === 'number' ? value : setting.min;
    const majors =
      setting.scale === 'log'
        ? [1, 10, 100, 1000].filter((entry) => entry >= setting.min && entry <= setting.max)
        : [setting.min, (setting.min + setting.max) / 2, setting.max];
    return {
      shape: 'arc',
      ticks: setting.presets.map((entry) => fractionOf(setting, entry)),
      majors: majors.map((entry) => fractionOf(setting, entry)),
      at: fractionOf(setting, number),
      level: true
    };
  }

  if (setting.kind === 'choice') {
    return listTrack(setting.options.length, setting.options.indexOf(String(value)));
  }

  return { shape: 'arc', ticks: [0, 1], majors: [0, 1], at: value === true ? 1 : 0, level: true };
}

function listTrack(count: number, index: number): Track {
  const span = Math.max(1, count - 1);
  return {
    shape: 'arc',
    ticks: Array.from({ length: count }, (_, entry) => entry / span),
    majors: [],
    at: index < 0 ? undefined : index / span,
    level: false
  };
}

function colorTrack(channel: Channel, { h, s, v }: Hsv): Track {
  if (channel === 'h') {
    return {
      shape: 'circle',
      ticks: Array.from({ length: 36 }, (_, index) => index / 36),
      majors: [0, 1 / 3, 2 / 3],
      at: h / 360,
      level: false,
      colors: Array.from({ length: 36 }, (_, index) => hsvToHex({ h: index * 10 + 5, s: 0.8, v: 0.9 }))
    };
  }

  const steps = 18;
  return {
    shape: 'arc',
    ticks: Array.from({ length: 11 }, (_, index) => index / 10),
    majors: [0, 0.5, 1],
    at: channel === 's' ? s : v,
    level: false,
    colors: Array.from({ length: steps }, (_, index) => {
      const t = (index + 0.5) / steps;
      return hsvToHex(channel === 's' ? { h, s: t, v: Math.max(v, 0.35) } : { h, s, v: t });
    })
  };
}

function settingText(setting: Setting, value: SettingValue | undefined) {
  if (setting.kind === 'number') {
    return { value: formatValue(typeof value === 'number' ? value : 0), unit: setting.unit };
  }

  if (setting.kind === 'choice') {
    return { value: String(value ?? setting.options[0]), unit: '' };
  }

  return { value: value === true ? 'On' : 'Off', unit: '' };
}

/** The setting's value `steps` detents away: presets for numbers, options for choices (no wrap), on/off for toggles. */
function stepSetting(setting: Setting, value: SettingValue | undefined, steps: number): SettingValue | undefined {
  if (setting.kind === 'number') {
    return stepPreset(setting, typeof value === 'number' ? value : setting.min, steps);
  }

  if (setting.kind === 'choice') {
    const index = Math.max(0, setting.options.indexOf(String(value)));
    return setting.options[Math.min(setting.options.length - 1, Math.max(0, index + steps))];
  }

  return steps > 0;
}

/** Where a zoom lies on the zoom track, geometrically from 5% to 1600%. */
function zoomFraction(scale: number) {
  return Math.log(scale / 0.05) / Math.log(16 / 0.05);
}

function zoomStopIndex(scale: number) {
  return zoomStops.filter((entry) => entry <= scale * 1.0001).length;
}

function clampUnit(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}
