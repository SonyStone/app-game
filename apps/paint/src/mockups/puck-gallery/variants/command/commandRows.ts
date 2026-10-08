import { hsvToHex, parseHex } from '../../../../features/color/hsv';
import type { SketchIconName } from '../../../../shared/ui/SketchIcon';
import { palette, presets, tools, type Preset, type Setting } from '../../kit/catalog';
import { blendLabel, blendModes, type Layer } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { formatValue, fractionOf, stepPreset, valueAt, type NumberSetting } from '../../kit/values';

/**
 * The palette's content: every row it can list, grouped, and the typed commands with arguments ("size 40",
 * "#ff8800", "blend multiply"). Rows are plain data rebuilt from the studio on every change; the palette keys them
 * by `id`, so a row keeps its element (and a drag's pointer capture) while its values change.
 */

/** The groups in the order an empty query lists them; a query orders them by their best match. */
export const groups = [
  { id: 'command', label: 'Command' },
  { id: 'recent', label: 'Recent' },
  { id: 'tools', label: 'Tools' },
  { id: 'brushes', label: 'Brushes' },
  { id: 'color', label: 'Color' },
  { id: 'settings', label: 'Settings' },
  { id: 'layers', label: 'Layers' },
  { id: 'view', label: 'View' }
] as const;

export type GroupId = (typeof groups)[number]['id'];

/** One entry of the list: a group header or a row, with the label's characters the query matched. */
export type ListItem = {
  id: string;
  group: GroupId;
  header?: { label: string; detail?: string };
  row?: Row;
  hits: readonly number[];
};

/** A row of the list. Only `id`, `group`, `label` and `look` are required; the rest describes what it does. */
export type Row = {
  id: string;
  group: GroupId;
  label: string;
  look: Look;
  /** Muted text after the label. */
  detail?: string;
  icon?: SketchIconName;
  /** Keycaps at the right: the shortcut that does the same outside the palette. */
  keys?: readonly string[];
  /** Words the filter matches besides the label. */
  keywords?: string;
  /** Marks the current tool, preset or blend mode. */
  current?: boolean;
  disabled?: boolean;
  /** Listed only for a query, as the Puck row already offers it. */
  searchOnly?: boolean;
  /** Enter and a tap. Rows without it (scrubbers, choices) only take the selection; Enter then closes. */
  run?: () => void;
  /** Running keeps the palette open, for actions that repeat (undo, reordering) and setting tweaks. */
  repeats?: boolean;
  /** ←/→, the wheel and the row's ‹ › buttons: one preset, option or swatch further. */
  adjust?: (direction: 1 | -1) => void;
  /** A sideways drag on the row. */
  scrub?: Scrub;
  /** What Enter or a drag does, for the footer. */
  hint?: string;
  /** The query that rebuilds a typed command, so that Recent can offer it again. */
  recall?: string;
};

/** A row's value as a sideways drag changes it: the drag moves the fraction by its distance over the row's width. */
export type Scrub = {
  /** Where the value lies in its range, 0–1 (geometric for log settings). */
  fraction: number;
  /** The value as the row prints it, with its unit. */
  text: string;
  /** Sets the value at a fraction; called on every move of the drag. */
  setFraction: (fraction: number) => void;
  /** Ends an edit, after a drag or a pause in stepping: commits a color. */
  end?: () => void;
  /** A CSS gradient showing the range, for color channels. */
  track?: string;
};

/** How a row looks besides its icon, label and keys, and the parts in it that take their own taps. */
export type Look =
  | { kind: 'plain'; accessory?: string }
  | { kind: 'preset'; preset: Preset; color: string }
  | { kind: 'value' }
  | { kind: 'toggle'; on: boolean }
  | { kind: 'choice'; options: readonly string[]; value: string; choose: (option: string) => void }
  | { kind: 'swatches'; colors: readonly string[]; current: string; choose: (color: string) => void }
  | { kind: 'swap'; previous: string; current: string }
  | { kind: 'layer'; layer: Layer; active: boolean; toggleVisible: () => void; openBlend: () => void }
  | { kind: 'command'; preview?: Preview };

/** A typed command's preview: the value it sets against the current one, or the color it picks. */
export type Preview =
  | { kind: 'value'; from: number; to: number; text: string }
  | { kind: 'color'; from: string; to: string }
  | { kind: 'text'; text: string };

/** A row the palette ran, for the Recent group: its id and, for typed commands, the query that rebuilds it. */
export type RecentEntry = { id: string; recall?: string };

/** What rows may ask of the palette itself. */
export type ListUi = {
  /** Replaces the query, as a layer's blend chip does to list the blend modes, and selects the row `select`. */
  openQuery: (text: string, select?: string) => void;
};

/**
 * The list for a query. An empty query lists Recent and then every group in order; a query lists its typed
 * commands first, then the fuzzy matches, groups ordered by their best match and rows by score.
 */
export function buildList(studio: Studio, query: string, recent: readonly RecentEntry[], ui: ListUi): ListItem[] {
  const text = query.trim();
  const all = baseRows(studio, ui);
  if (!text) {
    const remembered = recent.flatMap((entry) => {
      const found = entry.recall
        ? parseCommands(entry.recall, studio).find((row) => row.id === entry.id)
        : all.find((row) => row.id === entry.id);
      return found ? [{ ...found, id: `recent:${found.id}`, group: 'recent' as const }] : [];
    });
    const shown = [...remembered, ...all.filter((row) => !row.searchOnly)];
    return layout(
      groups.map((group) => ({
        group: group.id,
        matches: shown.filter((row) => row.group === group.id).map((row) => ({ row, hits: [], score: 0 }))
      })),
      studio
    );
  }

  const commands = parseCommands(text, studio).map((row) => ({ row, hits: [] as number[], score: 0 }));
  const matches = all.flatMap((row) => {
    const found = matchRow(text, row);
    return found ? [{ row, ...found }] : [];
  });
  const ranked = groups
    .filter((group) => group.id !== 'command' && group.id !== 'recent')
    .map((group) => ({
      group: group.id,
      matches: matches.filter((match) => match.row.group === group.id).sort((a, b) => b.score - a.score)
    }))
    .filter((group) => group.matches.length > 0)
    .sort((a, b) => b.matches[0]!.score - a.matches[0]!.score);
  return layout([{ group: 'command', matches: commands }, ...ranked], studio, text);
}

/** Flattens groups into headers and rows, skipping empty groups. */
function layout(
  ordered: readonly { group: GroupId; matches: readonly { row: Row; hits: readonly number[] }[] }[],
  studio: Studio,
  query = ''
): ListItem[] {
  return ordered.flatMap(({ group, matches }) => {
    if (matches.length === 0) {
      return [];
    }

    const header =
      group === 'command'
        ? commandHeader(query, studio)
        : { label: groups.find((entry) => entry.id === group)!.label, detail: groupDetail(group, studio) };
    return [
      { id: `header:${group}`, group, header, hits: [] },
      ...matches.map(({ row, hits }) => ({ id: row.id, group, row, hits }))
    ];
  });
}

/** The command group's header: what the typed command does, and to which layer. */
function commandHeader(query: string, studio: Studio): { label: string; detail?: string } {
  const first = query.trim().toLowerCase().split(/\s+/)[0];
  const layer = studio.layers().find((entry) => entry.id === studio.activeLayer());
  if (first === 'blend') {
    return { label: 'Blend mode', ...(layer ? { detail: layer.name } : {}) };
  }

  if (first === 'hide' || first === 'show') {
    return { label: 'Visibility' };
  }

  return { label: 'Command' };
}

/** The muted note beside a group's header: whose settings, which layer. */
function groupDetail(group: GroupId, studio: Studio) {
  if (group === 'settings') {
    return studio.toolInfo().label;
  }

  if (group === 'layers') {
    return studio.layers().find((layer) => layer.id === studio.activeLayer())?.name;
  }

  if (group === 'color') {
    return studio.color();
  }

  return undefined;
}

/** Every row of every group, in display order, built from the studio's current state. */
function baseRows(studio: Studio, ui: ListUi): Row[] {
  return [
    ...toolRows(studio),
    ...brushRows(studio),
    ...colorRows(studio),
    ...settingRows(studio),
    ...layerRows(studio, ui),
    ...viewRows(studio)
  ];
}

function toolRows(studio: Studio): Row[] {
  return tools.map((tool) => ({
    id: `tool:${tool.id}`,
    group: 'tools',
    label: tool.label,
    icon: tool.icon,
    keys: [tool.key],
    keywords: 'tool',
    current: studio.tool() === tool.id,
    look: { kind: 'plain', ...(tool.paints || tool.id === 'picker' ? {} : { accessory: 'for show' }) },
    run: () => studio.setTool(tool.id),
    hint: 'Use tool'
  }));
}

function brushRows(studio: Studio): Row[] {
  return presets.map((preset) => ({
    id: `preset:${preset.id}`,
    group: 'brushes',
    label: preset.name,
    detail: preset.set,
    icon: tools.find((tool) => tool.id === preset.tool)!.icon,
    keywords: `brush preset ${preset.tool} ${preset.set}`,
    current: studio.preset() === preset.id && studio.tool() === preset.tool,
    look: { kind: 'preset', preset, color: studio.color() },
    run: () => studio.choosePreset(preset.id),
    hint: 'Apply preset'
  }));
}

/**
 * The color group: the previous/current swap, recent colors, the palette in rows of twelve and three channel
 * scrubbers (hue, saturation, brightness) that edit the color live and commit it when the edit ends.
 */
function colorRows(studio: Studio): Row[] {
  const color = studio.color();
  const hsv = studio.hsv();
  const swatchRow = (id: string, label: string, colors: readonly string[]): Row => ({
    id,
    group: 'color',
    label,
    keywords: 'color swatch',
    look: { kind: 'swatches', colors, current: color, choose: (next) => chooseColor(studio, next) },
    hint: 'Pick a swatch'
  });
  const channel = (
    key: 'h' | 's' | 'v',
    label: string,
    keywords: string,
    range: number,
    unit: string,
    track: string
  ): Row => {
    const set = (value: number) => studio.setColor(hsvToHex({ ...hsv, [key]: value }));
    return {
      id: `color:${key}`,
      group: 'color',
      label,
      keywords: `color ${keywords}`,
      look: { kind: 'value' },
      scrub: {
        fraction: hsv[key] / (key === 'h' ? 360 : 1),
        text: `${Math.round(key === 'h' ? hsv.h : hsv[key] * 100)}${unit}`,
        setFraction: (fraction) => set(key === 'h' ? Math.min(359.9, fraction * 360) : fraction),
        end: () => studio.commitColor(),
        track
      },
      adjust: (direction) => set(Math.min(range, Math.max(0, hsv[key] + direction * (key === 'h' ? 10 : 0.05)))),
      hint: 'Drag sideways, or step'
    };
  };

  return [
    {
      id: 'color:swap',
      group: 'color',
      label: 'Swap colors',
      icon: 'reset',
      keys: ['X'],
      keywords: 'color previous current exchange',
      look: { kind: 'swap', previous: studio.previous(), current: color },
      run: () => studio.swapColors(),
      hint: 'Swap with the previous color'
    },
    swatchRow('color:recent', 'Recent colors', studio.recent()),
    swatchRow('color:palette-1', 'Palette', palette.slice(0, 12)),
    swatchRow('color:palette-2', 'Palette', palette.slice(12)),
    channel('h', 'Hue', 'hue', 359.9, '°', `linear-gradient(to right, ${hueStops})`),
    channel(
      's',
      'Saturation',
      'saturation sat chroma',
      1,
      '%',
      `linear-gradient(to right, ${hsvToHex({ ...hsv, s: 0 })}, ${hsvToHex({ ...hsv, s: 1 })})`
    ),
    channel(
      'v',
      'Brightness',
      'brightness value lightness',
      1,
      '%',
      `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})`
    )
  ];
}

const hueStops = '#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000';

/** The current tool's settings: numbers scrub, toggles flip, choices pick from segments. */
function settingRows(studio: Studio): Row[] {
  const tool = studio.toolInfo();
  return studio.settings().map((setting): Row => {
    const base = {
      id: `setting:${setting.key}`,
      group: 'settings' as const,
      label: setting.label,
      keywords: `${setting.short} ${setting.key} ${tool.label} setting`
    };
    if (setting.kind === 'number') {
      const value = studio.number(setting.key);
      return {
        ...base,
        icon: 'numbers',
        ...(setting.key === 'size' ? { keys: ['[', ']'] } : {}),
        look: { kind: 'value' },
        scrub: {
          fraction: fractionOf(setting, value),
          text: withUnit(value, setting.unit),
          setFraction: (fraction) => studio.setValue(setting.key, valueAt(setting, fraction))
        },
        adjust: (direction) => studio.setValue(setting.key, stepPreset(setting, value, direction)),
        hint: 'Drag sideways, or step presets'
      };
    }

    if (setting.kind === 'toggle') {
      const on = studio.value(setting.key) === true;
      return {
        ...base,
        icon: setting.icon ?? 'check',
        look: { kind: 'toggle', on },
        run: () => studio.setValue(setting.key, !on),
        repeats: true,
        hint: on ? 'Turn off' : 'Turn on'
      };
    }

    return choiceRow(studio, setting, base);
  });
}

function choiceRow(studio: Studio, setting: Extract<Setting, { kind: 'choice' }>, base: Omit<Row, 'look'>): Row {
  const value = String(studio.value(setting.key));
  const index = Math.max(0, setting.options.indexOf(value));
  return {
    ...base,
    icon: 'more',
    keywords: `${base.keywords} ${setting.options.join(' ')}`,
    look: {
      kind: 'choice',
      options: setting.options,
      value,
      choose: (option) => studio.setValue(setting.key, option)
    },
    adjust: (direction) =>
      studio.setValue(
        setting.key,
        setting.options[(index + direction + setting.options.length) % setting.options.length]!
      ),
    hint: 'Choose'
  };
}

/**
 * Layers from the top down, each selectable, with its eye, its blend chip (which lists the blend modes) and a
 * sideways drag for its opacity; then the layer commands.
 */
function layerRows(studio: Studio, ui: ListUi): Row[] {
  const list = studio.layers();
  const activeId = studio.activeLayer();
  const index = list.findIndex((layer) => layer.id === activeId);
  const active = list[index];
  const layers = list.map((layer): Row => {
    const setOpacity = (opacity: number) => studio.updateLayer(layer.id, { opacity });
    return {
      id: `layer:${layer.id}`,
      group: 'layers',
      label: layer.name,
      keywords: `layer ${blendLabel(layer.blend)} ${layer.visible ? 'visible' : 'hidden'}`,
      current: layer.id === activeId,
      look: {
        kind: 'layer',
        layer,
        active: layer.id === activeId,
        toggleVisible: () => studio.updateLayer(layer.id, { visible: !layer.visible }),
        openBlend: () => {
          studio.selectLayer(layer.id);
          ui.openQuery('blend ', `command:blend:${layer.blend}`);
        }
      },
      run: () => studio.selectLayer(layer.id),
      scrub: {
        fraction: layer.opacity / 100,
        text: `${Math.round(layer.opacity)}%`,
        setFraction: (fraction) => setOpacity(Math.round(fraction * 100))
      },
      adjust: (direction) => setOpacity(stepPreset(opacitySetting, layer.opacity, direction)),
      hint: 'Select · drag sideways for opacity'
    };
  });
  const command = (
    id: string,
    label: string,
    icon: SketchIconName,
    keywords: string,
    run: () => void,
    extra: Partial<Row> = {}
  ): Row => ({
    id: `layer-command:${id}`,
    group: 'layers',
    label,
    icon,
    keywords: `layer ${keywords}`,
    look: { kind: 'plain' },
    run,
    hint: label,
    ...extra
  });

  return [
    ...layers,
    command('new', 'New layer', 'newLayer', 'new add create', () => studio.addLayer()),
    command('duplicate', 'Duplicate layer', 'copy', 'duplicate copy clone', () => studio.duplicateLayer(), {
      ...(active ? { detail: active.name } : {})
    }),
    command('delete', 'Delete layer', 'trash', 'delete remove', () => studio.deleteLayer(), {
      ...(active ? { detail: active.name } : {}),
      disabled: list.length <= 1
    }),
    command('up', 'Move layer up', 'up', 'move up raise reorder', () => studio.moveLayer('up'), {
      repeats: true,
      disabled: index <= 0
    }),
    command('down', 'Move layer down', 'down', 'move down lower reorder', () => studio.moveLayer('down'), {
      repeats: true,
      disabled: index < 0 || index >= list.length - 1
    })
  ];
}

const opacitySetting: NumberSetting = {
  kind: 'number',
  key: 'opacity',
  label: 'Opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]
};

function viewRows(studio: Studio): Row[] {
  const view = studio.view();
  const history = studio.history();
  const action = (id: string, label: string, icon: SketchIconName, keywords: string, extra: Partial<Row>): Row => ({
    id: `view:${id}`,
    group: 'view',
    label,
    icon,
    keywords: `view ${keywords}`,
    look: { kind: 'plain' },
    hint: label,
    ...extra
  });

  return [
    action('fit', 'Fit to screen', 'fullscreen', 'fit whole sheet reset', { run: () => studio.fit() }),
    action('flip', 'Flip view', 'mirror', 'flip mirror horizontal', {
      look: { kind: 'toggle', on: view.flipped },
      run: () => studio.flip()
    }),
    action('symmetry', 'Symmetry', 'symmetry', 'symmetry mirror paint', {
      look: { kind: 'toggle', on: studio.symmetry() },
      run: () => studio.toggleSymmetry()
    }),
    action('straighten', 'Reset rotation', 'reset', 'rotation straighten angle', {
      look: { kind: 'plain', accessory: `${Math.round(view.angle)}°` },
      disabled: Math.round(view.angle) === 0,
      run: () => studio.rotateTo(0)
    }),
    action('actual', 'Zoom 100%', 'zoom', 'zoom actual pixels 100', {
      look: { kind: 'plain', accessory: `${Math.round(view.scale * 100)}%` },
      run: () => studio.zoomTo(1)
    }),
    action('undo', 'Undo', 'undo', 'undo history back', {
      keys: [modKey, 'Z'],
      look: { kind: 'plain', accessory: `${history.done}` },
      searchOnly: true,
      disabled: history.done === 0,
      run: () => studio.undo(),
      repeats: true
    }),
    action('redo', 'Redo', 'redo', 'redo history forward', {
      keys: ['⇧', modKey, 'Z'],
      look: { kind: 'plain', accessory: `${history.undone}` },
      searchOnly: true,
      disabled: history.undone === 0,
      run: () => studio.redo(),
      repeats: true
    })
  ];
}

/** The platform's command key, for keycaps. */
export const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/**
 * The typed commands a query spells, best first: a color (`#ff8800`, `ff8800`, `color tomato`), a number for a
 * setting or the view (`size 40`, `op 50`, `zoom 200`, `rot 45`, `hue 200`, `layer op 60`; a bare number offers
 * the current tool's settings), `blend <mode>`, `hide <layer>` / `show <layer>`, `layer <name>` and
 * `undo 5` / `redo 5`.
 */
export function parseCommands(text: string, studio: Studio): Row[] {
  const query = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!query) {
    return [];
  }

  const words = query.split(' ');
  const [first = '', ...rest] = words;
  const argument = rest.join(' ');
  const rows: Row[] = [];

  const hex =
    query.startsWith('#') || /^[0-9a-f]{6}$/.test(query)
      ? parseHex(query)
      : (first === 'color' || first === 'colour') && argument
        ? (parseHex(argument) ?? cssColor(argument))
        : undefined;
  if (hex) {
    rows.push(colorCommand(studio, hex, query));
  }

  if (first === 'blend') {
    rows.push(...blendCommands(studio, argument));
  }

  if (first === 'hide' || first === 'show') {
    rows.push(...visibilityCommands(studio, first, argument));
  }

  if (first === 'layer' && argument && !/\d/.test(argument) && !layerCommandWords.has(rest[0]!)) {
    rows.push(...selectLayerCommands(studio, argument));
  }

  if ((first === 'undo' || first === 'redo') && /^\d+$/.test(argument)) {
    rows.push(historyCommand(studio, first, Number(argument), query));
  }

  rows.push(...numberCommands(studio, words, query));
  return rows;
}

/** Words after "layer" that name a layer command, which the filter finds, rather than a layer. */
const layerCommandWords = new Set(['new', 'add', 'dup', 'duplicate', 'copy', 'delete', 'del', 'remove', 'up', 'down']);

function colorCommand(studio: Studio, hex: string, query: string): Row {
  return {
    id: `command:color:${hex}`,
    group: 'command',
    label: 'Set color',
    detail: hex,
    icon: 'picker',
    recall: query,
    look: { kind: 'command', preview: { kind: 'color', from: studio.color(), to: hex } },
    run: () => chooseColor(studio, hex),
    hint: 'Set color'
  };
}

/** Sets and commits a color, so that it joins Recent and the color before it becomes the previous one. */
function chooseColor(studio: Studio, hex: string) {
  studio.chooseColor(hex);
}

/** Rebuilds the swatch pick of `hex` as a typed color command, so that Recent can offer it. */
export function colorEntry(hex: string): RecentEntry {
  return { id: `command:color:${hex}`, recall: hex };
}

function blendCommands(studio: Studio, argument: string): Row[] {
  const layer = studio.layers().find((entry) => entry.id === studio.activeLayer());
  if (!layer) {
    return [];
  }

  return blendModes
    .flatMap((mode) => {
      const found = argument ? fuzzy(argument, blendLabel(mode)) : { score: 0, hits: [] };
      return found ? [{ mode, score: found.score }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ mode }) => ({
      id: `command:blend:${mode}`,
      group: 'command' as const,
      label: blendLabel(mode),
      icon: 'layers' as const,
      recall: `blend ${blendLabel(mode).toLowerCase()}`,
      current: layer.blend === mode,
      look: { kind: 'command' as const },
      run: () => {
        studio.updateLayer(layer.id, { blend: mode });
        studio.notify(`${layer.name}: ${blendLabel(mode)}`);
      },
      hint: 'Set blend mode'
    }));
}

function visibilityCommands(studio: Studio, verb: 'hide' | 'show', argument: string): Row[] {
  return matchingLayers(studio, argument).map((layer) => ({
    id: `command:${verb}:${layer.id}`,
    group: 'command' as const,
    label: `${verb === 'hide' ? 'Hide' : 'Show'} ${layer.name}`,
    detail: layer.visible ? 'visible' : 'hidden',
    icon: verb === 'hide' ? ('hidden' as const) : ('eye' as const),
    recall: `${verb} ${layer.name.toLowerCase()}`,
    look: { kind: 'command' as const },
    run: () => {
      studio.updateLayer(layer.id, { visible: verb === 'show' });
      studio.notify(`${layer.name} ${verb === 'show' ? 'shown' : 'hidden'}`);
    },
    hint: verb === 'hide' ? 'Hide layer' : 'Show layer'
  }));
}

function selectLayerCommands(studio: Studio, argument: string): Row[] {
  return matchingLayers(studio, argument).map((layer) => ({
    id: `command:select:${layer.id}`,
    group: 'command' as const,
    label: `Select ${layer.name}`,
    detail: 'layer',
    icon: 'layers' as const,
    recall: `layer ${layer.name.toLowerCase()}`,
    current: layer.id === studio.activeLayer(),
    look: { kind: 'command' as const },
    run: () => studio.selectLayer(layer.id),
    hint: 'Select layer'
  }));
}

/** The layers whose names match `argument`, best first; all of them, top down, for an empty one. */
function matchingLayers(studio: Studio, argument: string): Layer[] {
  if (!argument) {
    return [...studio.layers()];
  }

  return studio
    .layers()
    .flatMap((layer) => {
      const found = fuzzy(argument, layer.name);
      return found ? [{ layer, score: found.score }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ layer }) => layer);
}

function historyCommand(studio: Studio, verb: 'undo' | 'redo', count: number, query: string): Row {
  const available = verb === 'undo' ? studio.history().done : studio.history().undone;
  const steps = Math.min(count, available);
  return {
    id: `command:${verb}:${count}`,
    group: 'command',
    label: `${verb === 'undo' ? 'Undo' : 'Redo'} ${count} ${count === 1 ? 'step' : 'steps'}`,
    detail: `${available} available`,
    icon: verb,
    recall: query,
    disabled: steps === 0,
    repeats: true,
    look: { kind: 'command' },
    run: () => {
      for (let step = 0; step < steps; step++) {
        if (verb === 'undo') {
          studio.undo();
        } else {
          studio.redo();
        }
      }
    },
    hint: verb === 'undo' ? 'Undo' : 'Redo'
  };
}

/**
 * Commands that set a number: the words before the number abbreviate a target's name ("op", "hard", "layer op");
 * no words offer the current tool's settings and the zoom. Values clamp to the target's range.
 */
function numberCommands(studio: Studio, words: readonly string[], query: string): Row[] {
  const typed = /^([-+]?\d+(?:\.\d+)?)(%|px|°|deg)?$/.exec(words[words.length - 1] ?? '');
  if (!typed) {
    return [];
  }

  const name = words.slice(0, -1).join(' ');
  const targets = numberTargets(studio);
  const candidates = name
    ? targets
        .filter((target) => target.names.some((entry) => entry.startsWith(name)))
        .sort((a, b) => Number(b.names.includes(name)) - Number(a.names.includes(name)))
    : targets.filter((target) => target.bare);

  return candidates.slice(0, 5).map((target) => {
    const { setting } = target;
    const value = Math.min(setting.max, Math.max(setting.min, Number(typed[1])));
    const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    const clamped = rounded !== Number(typed[1]);
    return {
      id: `command:set:${target.id}:${rounded}`,
      group: 'command' as const,
      label: `Set ${target.label.toLowerCase()}`,
      detail: clamped ? `${target.detail} · limit` : target.detail,
      icon: target.icon,
      recall: query,
      look: {
        kind: 'command' as const,
        preview: {
          kind: 'value' as const,
          from: fractionOf(setting, target.value),
          to: fractionOf(setting, rounded),
          text: `${formatValue(target.value)} → ${withUnit(rounded, setting.unit)}`
        }
      },
      run: () => {
        target.set(rounded);
        studio.notify(`${target.label} ${withUnit(rounded, setting.unit)}`);
      },
      hint: `Set ${target.label.toLowerCase()}`
    };
  });
}

/** Something a typed number can set: its names, range and current value. */
type NumberTarget = {
  id: string;
  /** Lowercase names the typed words may abbreviate. */
  names: readonly string[];
  label: string;
  detail: string;
  icon: SketchIconName;
  setting: NumberSetting;
  value: number;
  set: (value: number) => void;
  /** Offered for a bare number. */
  bare?: boolean;
};

function numberTargets(studio: Studio): NumberTarget[] {
  const tool = studio.toolInfo();
  const view = studio.view();
  const hsv = studio.hsv();
  const layer = studio.layers().find((entry) => entry.id === studio.activeLayer());
  const range = (key: string, label: string, min: number, max: number, unit: string, scale?: 'log') =>
    ({ kind: 'number', key, label, short: key, min, max, unit, presets: [], ...(scale ? { scale } : {}) }) as const;
  const settings = studio
    .settings()
    .filter((setting): setting is NumberSetting => setting.kind === 'number')
    .map(
      (setting): NumberTarget => ({
        id: setting.key,
        names: [setting.label.toLowerCase(), setting.short.toLowerCase(), setting.key.toLowerCase()],
        label: setting.label,
        detail: tool.label,
        icon: 'numbers',
        setting,
        value: studio.number(setting.key),
        set: (value) => studio.setValue(setting.key, value),
        bare: true
      })
    );
  const color = (key: 'h' | 's' | 'v', names: string[], label: string): NumberTarget => ({
    id: `color-${key}`,
    names,
    label,
    detail: 'Color',
    icon: 'picker',
    setting: key === 'h' ? range(key, label, 0, 359, '°') : range(key, label, 0, 100, '%'),
    value: Math.round(key === 'h' ? hsv.h : hsv[key] * 100),
    set: (value) => chooseColor(studio, hsvToHex({ ...hsv, [key]: key === 'h' ? value : value / 100 }))
  });

  return [
    ...settings,
    {
      id: 'zoom',
      names: ['zoom', 'z', 'scale'],
      label: 'Zoom',
      detail: 'View',
      icon: 'zoom',
      setting: range('zoom', 'Zoom', 5, 1600, '%', 'log'),
      value: Math.round(view.scale * 100),
      set: (value) => studio.zoomTo(value / 100),
      bare: true
    },
    {
      id: 'rotation',
      names: ['rotation', 'rotate', 'rot', 'turn'],
      label: 'Rotation',
      detail: 'View',
      icon: 'rotate',
      setting: range('rotation', 'Rotation', -180, 180, '°'),
      value: Math.round(view.angle),
      set: (value) => studio.rotateTo(value)
    },
    color('h', ['hue'], 'Hue'),
    color('s', ['saturation', 'sat'], 'Saturation'),
    color('v', ['brightness', 'bri', 'value', 'val'], 'Brightness'),
    ...(layer
      ? [
          {
            id: 'layer-opacity',
            names: ['layer opacity', 'lop'],
            label: 'Layer opacity',
            detail: layer.name,
            icon: 'layers' as const,
            setting: opacitySetting,
            value: layer.opacity,
            set: (value: number) => studio.updateLayer(layer.id, { opacity: value })
          }
        ]
      : [])
  ];
}

/** A CSS color name or function as `#rrggbb`, through a canvas's color parser; `undefined` if it is none. */
function cssColor(text: string): string | undefined {
  cssContext ??= document.createElement('canvas').getContext('2d') ?? undefined;
  if (!cssContext) {
    return undefined;
  }

  cssContext.fillStyle = '#010203';
  cssContext.fillStyle = text;
  const parsed = String(cssContext.fillStyle);
  return parsed !== '#010203' && /^#[0-9a-f]{6}$/.test(parsed) ? parsed : undefined;
}

let cssContext: CanvasRenderingContext2D | undefined;

/** A value with its unit as rows print it: "12 px", "80%", "45°". */
export function withUnit(value: number, unit: string) {
  return unit === 'px' ? `${formatValue(value)} px` : `${formatValue(value)}${unit}`;
}

/**
 * Matches every word of the query against the row's label, or failing that its detail and keywords; the score sums
 * the words' scores, and only label matches are highlighted. A query that is the row's shortcut key ranks it first.
 */
function matchRow(query: string, row: Row): { score: number; hits: number[] } | undefined {
  // Typing a row's shortcut key ("x", "b", "[") finds that row first.
  if (row.keys?.some((key) => key.toLowerCase() === query.trim().toLowerCase())) {
    return { score: 200, hits: [] };
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${row.detail ?? ''} ${row.keywords ?? ''}`;
  let score = 0;
  const hits: number[] = [];
  for (const word of words) {
    const inLabel = fuzzy(word, row.label);
    if (inLabel) {
      score += inLabel.score;
      hits.push(...inLabel.hits);
      continue;
    }

    const inKeywords = fuzzy(word, haystack);
    if (!inKeywords) {
      return undefined;
    }

    score += inKeywords.score * 0.6;
  }

  return { score: score + (row.current ? 0.5 : 0), hits };
}

/**
 * A fuzzy match of `query` in `text`, case-insensitive: a substring scores best (most at the start, then at a word
 * start); otherwise the query's characters in order, each continuing a run or starting a word, as in "sr" for Soft
 * Round or "flc" for Flat colors. Returns the matched character indices for highlighting.
 */
export function fuzzy(query: string, text: string): { score: number; hits: number[] } | undefined {
  const needle = query.toLowerCase();
  const hay = text.toLowerCase();
  if (!needle) {
    return { score: 0, hits: [] };
  }

  // A single letter inside a word matches nearly everything: it must start a word.
  const at =
    needle.length > 1
      ? hay.indexOf(needle)
      : [...hay].findIndex((char, index) => char === needle && wordStart(hay, index));
  if (at >= 0) {
    const bonus = at === 0 ? 40 : wordStart(hay, at) ? 24 : 0;
    return {
      score: 60 + bonus + needle.length * 4 - hay.length * 0.2,
      hits: Array.from({ length: needle.length }, (_, index) => at + index)
    };
  }

  const hits: number[] = [];
  let score = 0;
  let from = 0;
  for (const char of needle) {
    let index = hay.indexOf(char, from);
    if (index < 0) {
      return undefined;
    }

    if (index !== (hits[hits.length - 1] ?? -2) + 1 && !wordStart(hay, index)) {
      // Scattered letters inside words match too much: take the next word starting with it.
      index = -1;
      for (let later = from; later < hay.length; later++) {
        if (hay[later] === char && wordStart(hay, later)) {
          index = later;
          break;
        }
      }

      if (index < 0) {
        return undefined;
      }
    }

    const run = index === (hits[hits.length - 1] ?? -2) + 1;
    score += 1 + (wordStart(hay, index) ? 6 : 0) + (run ? 4 : 0) - Math.min(3, (index - from) * 0.2);
    hits.push(index);
    from = index + 1;
  }

  return { score, hits };
}

function wordStart(text: string, index: number) {
  return index === 0 || /[\s\-·(→/]/.test(text[index - 1]!);
}
