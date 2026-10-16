import type { BlendMode } from '@app-game/paint-core/document';
import { swatchColors } from './colorNames';
import { describeIntent, groupOf, intentKey, parseCommand, type CommandContext, type Intent } from './commands';
import { rankByQuery } from './fuzzy';

/** A row of the palette: what it runs and how it is shown. */
export type PaletteEntry = {
  /** Run in order; a typed command such as `red, size 12` has several. */
  intents: Intent[];
  title: string;
  group: string;
  /** Secondary text after the title, such as a layer's opacity and blend mode. */
  detail?: string;
  /** Other words the search finds it by. */
  keywords?: string;
  /** The keyboard shortcut that does the same, shown at the row's end. */
  shortcut?: string;
  /** The color a color row paints with, shown as a swatch. */
  swatch?: string;
  /** One of a series of values, such as `Brush 16 px`, listed only when the query names its setting. */
  step?: boolean;
  /** What the row sets is already so, such as the current color; shown marked. */
  current?: boolean;
  /** A switch at the row's end, such as a layer's visibility, running its own intents. */
  secondary?: { intents: Intent[]; label: string; pressed: boolean };
};

/** What the palette lists from the session, beside the parser's `CommandContext`. */
export type PaletteContext = CommandContext & {
  /** Opacity and blend mode per layer, bottom first, in the order of `layers`. */
  layerDetails: readonly { visible: boolean; opacity: number; blend: BlendMode }[];
  /** The active layer's number, from 1 at the bottom. */
  activeLayer: number;
  /** The Mixer Brush is in use, so its commands apply. */
  mixer: boolean;
  /** The page has a playground to return to. */
  playground: boolean;
};

/**
 * The palette's rows for `query`. A query the parser fully understands comes first, as what Enter runs (`size 24`,
 * `red, bigger`), followed by every command, preset, layer and color that the query finds, best match first. The query
 * `color` lists every named color, `layers` the layers top first before the layer commands; series of values such as
 * brush sizes show for `size`, `opacity`, `zoom` and `quickshape`. An empty query lists everything in catalog order.
 */
export function searchPalette(query: string, context: PaletteContext): PaletteEntry[] {
  const trimmed = query.trim();
  const all = catalog(context);
  if (/^colou?rs?$/i.test(trimmed)) {
    return all.filter((entry) => entry.swatch !== undefined);
  }

  if (/^layers?$/i.test(trimmed)) {
    const layers = all.filter((entry) => entry.secondary !== undefined);
    return [...layers, ...all.filter((entry) => entry.group === 'Layer' && entry.secondary === undefined)];
  }

  const parsed = trimmed ? parseCommand(trimmed, context) : undefined;
  const steps = /^(?:size|px|opacity|zoom|quick\s*shape)/i.test(trimmed);
  const found = rankByQuery(
    trimmed,
    all.filter((entry) => steps || !entry.step)
  );
  if (!parsed) {
    return found;
  }

  const first = parsedEntry(parsed, context);
  const key = parsed.length === 1 ? intentKey(parsed[0]!) : undefined;
  // The catalog row of the same command takes the parsed row's place, keeping its shortcut and swatch.
  const same =
    key === undefined
      ? undefined
      : found.find((entry) => entry.intents.length === 1 && intentKey(entry.intents[0]!) === key);
  return [same ?? first, ...found.filter((entry) => entry !== same)];
}

/** One row running `intents`, titled by what they do. */
export function parsedEntry(intents: Intent[], context: CommandContext): PaletteEntry {
  return {
    intents,
    title: intents.map((intent) => describeIntent(intent, context)).join(' · '),
    group: intents.length === 1 ? groupOf(intents[0]!) : 'Commands'
  };
}

/**
 * Every command the palette offers without typing a value: tools, brush presets, colors, layer and selection
 * commands, view, symmetry, QuickShape, history and file commands, in that order. Presets, layers and Mixer Brush
 * commands come from `context`.
 */
export function catalog(context: PaletteContext): PaletteEntry[] {
  const entry = (
    intent: Intent,
    extra: Omit<PaletteEntry, 'intents' | 'title' | 'group'> & { title?: string } = {}
  ) => ({
    intents: [intent],
    title: describeIntent(intent, context),
    group: groupOf(intent),
    ...extra
  });
  const blends: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay'];

  return [
    entry({ type: 'tool', tool: 'brush' }, { keywords: 'paint pen draw', shortcut: 'B' }),
    entry({ type: 'tool', tool: 'eraser' }, { keywords: 'erase rubber', shortcut: 'E' }),
    entry({ type: 'selection-tool', tool: 'lasso' }, { keywords: 'select freehand selection', shortcut: 'L' }),
    entry({ type: 'selection-tool', tool: 'rectangle' }, { keywords: 'select box marquee square' }),
    entry({ type: 'selection-tool', tool: 'ellipse' }, { keywords: 'select oval circle' }),
    entry({ type: 'selection-tool', tool: 'polygon' }, { keywords: 'select polygonal lasso' }),
    entry({ type: 'selection-tool', tool: 'wand' }, { keywords: 'select automatic auto', shortcut: 'W' }),
    entry({ type: 'tool', tool: 'fill' }, { keywords: 'bucket paint fill selection', shortcut: 'G' }),
    entry({ type: 'tool', tool: 'gradient' }, { keywords: 'blend ramp' }),
    entry({ type: 'tool', tool: 'local-undo' }, { keywords: 'part area revert restore history brush', shortcut: 'Y' }),
    entry({ type: 'transform' }, { keywords: 'move scale rotate free distort warp', shortcut: 'Ctrl T' }),
    entry({ type: 'colors', action: 'pick' }, { keywords: 'picker pick sample color', shortcut: 'Alt' }),
    entry({ type: 'scale-size', factor: 1.25 }, { keywords: 'size larger increase', shortcut: ']' }),
    entry({ type: 'scale-size', factor: 0.8 }, { keywords: 'size decrease', shortcut: '[' }),
    ...brushSizes.map((px) => entry({ type: 'size', px }, { keywords: 'size px', step: true })),
    ...opacities.map((value) =>
      entry({ type: 'brush-value', key: 'opacity', value }, { keywords: 'brush transparency', step: true })
    ),
    ...context.presets.map((preset) =>
      entry({ type: 'preset', id: preset.id, name: preset.name }, { keywords: 'brush preset' })
    ),
    entry({ type: 'colors', action: 'swap' }, { keywords: 'exchange foreground background', shortcut: 'X' }),
    entry({ type: 'colors', action: 'reset' }, { keywords: 'default reset colors', shortcut: 'D' }),
    ...swatchColors.map((color) =>
      entry({ type: 'color', hex: color.hex, name: color.name }, { keywords: 'color colour', swatch: color.hex })
    ),
    entry({ type: 'layer', action: 'add' }, { keywords: 'add create' }),
    ...context.layers
      .map((layer, index) => {
        const detail = context.layerDetails[index];
        return entry(
          { type: 'layer', action: 'select', layer: index + 1 },
          {
            secondary: {
              intents: [{ type: 'layer-flag', flag: 'visible', value: !(detail?.visible ?? true), layer: index + 1 }],
              label: detail?.visible === false ? `Show ${layer.name}` : `Hide ${layer.name}`,
              pressed: detail?.visible ?? true
            },
            title: layer.name,
            keywords: `layer ${index + 1} go to select`,
            detail: [
              index + 1 === context.activeLayer ? 'active' : undefined,
              detail && !detail.visible ? 'hidden' : undefined,
              detail && detail.opacity < 1 ? `${Math.round(detail.opacity * 100)}%` : undefined,
              detail && detail.blend !== 'normal' ? capitalize(detail.blend) : undefined
            ]
              .filter(Boolean)
              .join(' · ')
          }
        );
      })
      .reverse(),
    entry({ type: 'layer-flag', flag: 'visible' }, { keywords: 'hide show visibility layer' }),
    entry({ type: 'layer', action: 'duplicate' }, { keywords: 'copy clone layer' }),
    entry({ type: 'layer', action: 'merge-down' }, { keywords: 'combine layer' }),
    entry({ type: 'layer', action: 'up' }, { keywords: 'raise order layer' }),
    entry({ type: 'layer', action: 'down' }, { keywords: 'lower order layer' }),
    entry({ type: 'layer-flag', flag: 'alphaLock' }, { keywords: 'lock transparency alpha layer' }),
    entry({ type: 'layer-flag', flag: 'clipping' }, { keywords: 'clip clipping mask layer' }),
    ...blends.map((blend) => entry({ type: 'layer-blend', blend }, { keywords: 'blend mode layer' })),
    entry({ type: 'layer', action: 'delete' }, { keywords: 'remove trash layer' }),
    entry({ type: 'selection', action: 'all' }, { shortcut: 'Ctrl A' }),
    entry({ type: 'selection', action: 'none' }, { keywords: 'clear selection unselect', shortcut: 'Ctrl D' }),
    entry({ type: 'selection', action: 'invert' }, { keywords: 'inverse', shortcut: 'Ctrl ⇧ I' }),
    entry({ type: 'selection', action: 'copy' }, { keywords: 'selection clipboard', shortcut: 'Ctrl C' }),
    entry({ type: 'selection', action: 'cut' }, { keywords: 'selection clipboard', shortcut: 'Ctrl X' }),
    entry({ type: 'selection', action: 'paste' }, { keywords: 'selection clipboard', shortcut: 'Ctrl V' }),
    entry({ type: 'selection', action: 'delete' }, { keywords: 'clear erase selection', shortcut: 'Del' }),
    entry({ type: 'selection', action: 'new-layer' }, { keywords: 'lift copy layer' }),
    entry({ type: 'selection', action: 'fill' }, { keywords: 'color fill' }),
    entry({ type: 'feather', px: 8 }, { keywords: 'soften selection edges' }),
    entry({ type: 'zoom-by', factor: 1.25 }, { keywords: 'magnify closer', shortcut: 'Ctrl +' }),
    entry({ type: 'zoom-by', factor: 0.8 }, { keywords: 'further', shortcut: 'Ctrl −' }),
    entry({ type: 'zoom', percent: 100 }, { keywords: 'actual size 1:1', shortcut: 'Ctrl 0' }),
    ...zoomSteps.map((percent) => entry({ type: 'zoom', percent }, { keywords: 'magnify', step: true })),
    entry({ type: 'view', action: 'reset' }, { keywords: 'home center fit camera' }),
    entry({ type: 'rotate', degrees: 0 }, { keywords: 'reset rotation straighten' }),
    entry({ type: 'rotate', degrees: -15, relative: true }, { keywords: 'turn counterclockwise' }),
    entry({ type: 'rotate', degrees: 15, relative: true }, { keywords: 'turn clockwise' }),
    entry({ type: 'view', action: 'mirror' }, { keywords: 'flip horizontally canvas' }),
    entry({ type: 'view', action: 'fullscreen' }, { keywords: 'full screen' }),
    entry({ type: 'view', action: 'pixel-grid' }, { keywords: 'pixels grid' }),
    entry({ type: 'window', window: 'palette' }, { keywords: 'mix paint tubes knife colors window' }),
    entry({ type: 'window', window: 'pen' }, { keywords: 'palm rejection hover stylus settings window' }),
    entry({ type: 'window', window: 'pressure' }, { keywords: 'pen pressure curve stylus calibration window' }),
    entry({ type: 'symmetry', mode: 'off' }, { keywords: 'mirror none' }),
    entry({ type: 'symmetry', mode: 'vertical' }, { keywords: 'mirror' }),
    entry({ type: 'symmetry', mode: 'horizontal' }, { keywords: 'mirror' }),
    entry({ type: 'symmetry', mode: 'dual' }, { keywords: 'mirror four way' }),
    entry({ type: 'symmetry', mode: 'diagonal' }, { keywords: 'mirror' }),
    entry({ type: 'symmetry', mode: 'radial', segments: 6 }, { keywords: 'rotational' }),
    entry({ type: 'symmetry', mode: 'mandala', segments: 6 }, { keywords: 'kaleidoscope' }),
    entry({ type: 'quickshape', enabled: true }, { keywords: 'shape line ellipse circle polygon draw and hold' }),
    entry({ type: 'quickshape', enabled: false }, { keywords: 'shape line ellipse circle polygon draw and hold' }),
    ...quickShapeHolds.map((delay) =>
      entry({ type: 'quickshape', delay }, { keywords: 'shape hold delay wait', step: true })
    ),
    entry({ type: 'history', action: 'undo', count: 1 }, { keywords: 'back revert', shortcut: 'Ctrl Z' }),
    entry({ type: 'history', action: 'redo', count: 1 }, { keywords: 'forward again', shortcut: 'Ctrl ⇧ Z' }),
    entry({ type: 'file', action: 'download' }, { keywords: 'save download file', shortcut: 'Ctrl S' }),
    entry({ type: 'file', action: 'png' }, { keywords: 'export save image share' }),
    entry({ type: 'file', action: 'psd' }, { keywords: 'export save photoshop share' }),
    entry({ type: 'file', action: 'open' }, { keywords: 'import file load' }),
    entry({ type: 'file', action: 'insert' }, { keywords: 'image photo picture place add' }),
    entry({ type: 'file', action: 'abr' }, { keywords: 'import brushes photoshop' }),
    ...(context.mixer
      ? [
          entry({ type: 'mixer', action: 'load' }, { keywords: 'mixer wet' }),
          entry({ type: 'mixer', action: 'clean' }, { keywords: 'mixer wash' }),
          entry({ type: 'mixer', action: 'pick' }, { keywords: 'mixer sample' })
        ]
      : []),
    entry({ type: 'app', action: 'help' }, { keywords: 'commands gestures how', shortcut: '?' }),
    entry({ type: 'app', action: 'hand-left' }, { keywords: 'hand side lefty' }),
    entry({ type: 'app', action: 'hand-right' }, { keywords: 'hand side' }),
    ...(context.playground
      ? [entry({ type: 'app', action: 'playground' }, { keywords: 'exit experiments variants' })]
      : [])
  ];
}

/**
 * Commands suggested when the palette opens empty, for the moment's work: the other painting tool, undo and redo
 * while possible, brush size steps, a new layer, and for a selection deselect and transform.
 */
export function suggestions(state: { tool: string; selected: boolean; canUndo: boolean; canRedo: boolean }): Intent[] {
  return [
    state.tool === 'brush' ? { type: 'tool', tool: 'eraser' } : { type: 'tool', tool: 'brush' },
    ...(state.canUndo ? [{ type: 'history', action: 'undo', count: 1 } as const] : []),
    ...(state.canRedo ? [{ type: 'history', action: 'redo', count: 1 } as const] : []),
    { type: 'scale-size', factor: 0.8 },
    { type: 'scale-size', factor: 1.25 },
    { type: 'colors', action: 'pick' },
    { type: 'layer', action: 'add' },
    ...(state.selected
      ? ([{ type: 'selection', action: 'none' }, { type: 'transform' }] as const)
      : ([{ type: 'selection-tool', tool: 'lasso' }] as const)),
    { type: 'view', action: 'reset' }
  ];
}

/** QuickShape hold times offered as rows, in milliseconds, like the brush sizes below. */
const quickShapeHolds = [250, 500, 750, 1000, 1500];

/** Brush sizes, opacities and zoom levels offered as rows, so that a finger chooses one without typing. */
const brushSizes = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const opacities = [0.1, 0.25, 0.5, 0.75, 1];
const zoomSteps = [25, 50, 200, 400];

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
