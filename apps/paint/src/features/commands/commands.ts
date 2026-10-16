import type { BlendMode } from '@app-game/paint-core/document';
import type { SelectionAction } from '@app-game/paint-core/protocol';
import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { maximumDelay, minimumDelay } from '../quickshape';
import type { SelectionTool } from '../selection';
import { parseColor } from './colorNames';

/**
 * One thing the palette can do, as plain data: what a typed or spoken command means, what a palette row runs and
 * what the recent commands remember. `layer` numbers count from 1 at the bottom, as the default layer names do; a
 * missing `layer` means the active layer. Values called `value` are fractions from 0 to 1.
 */
export type Intent =
  | { type: 'tool'; tool: 'brush' | 'eraser' | 'fill' | 'gradient' }
  | { type: 'selection-tool'; tool: SelectionTool }
  | { type: 'transform' }
  | { type: 'preset'; id: string; name: string }
  | { type: 'size'; px: number }
  | { type: 'scale-size'; factor: number }
  | { type: 'brush-value'; key: 'opacity' | 'flow' | 'hardness'; value: number }
  | { type: 'color'; hex: string; name: string }
  | { type: 'colors'; action: 'swap' | 'reset' | 'pick' }
  | { type: 'layer'; action: 'add' | 'duplicate' | 'delete' | 'merge-down' | 'up' | 'down' | 'select'; layer?: number }
  /** Sets a layer switch; without `value` it toggles. */
  | { type: 'layer-flag'; flag: 'visible' | 'alphaLock' | 'clipping'; value?: boolean; layer?: number }
  | { type: 'layer-opacity'; value: number; layer?: number }
  | { type: 'layer-blend'; blend: BlendMode; layer?: number }
  | { type: 'layer-rename'; name: string; layer?: number }
  | { type: 'selection'; action: 'all' | 'none' | 'invert' | 'fill' | SelectionAction }
  | { type: 'feather'; px: number }
  | { type: 'zoom'; percent: number }
  | { type: 'zoom-by'; factor: number }
  /** Turns the view to `degrees` clockwise, or by `degrees` when `relative`. */
  | { type: 'rotate'; degrees: number; relative?: boolean }
  | { type: 'view'; action: 'reset' | 'mirror' | 'fullscreen' | 'pixel-grid' }
  /** Opens or closes a window of the session: the mixing palette toggles, the Pen and calibration windows open. */
  | { type: 'window'; window: 'palette' | 'pen' | 'pressure' }
  | { type: 'symmetry'; mode: PaintSymmetry['mode']; segments?: number }
  /**
   * Switches QuickShape on or off, or toggles it without `enabled`; or sets its hold time `delay` in milliseconds,
   * which switches it on.
   */
  | { type: 'quickshape'; enabled?: boolean; delay?: number }
  | { type: 'history'; action: 'undo' | 'redo'; count: number }
  | { type: 'file'; action: 'png' | 'psd' | 'download' | 'open' | 'insert' | 'abr' }
  | { type: 'mixer'; action: 'load' | 'clean' | 'pick' }
  | { type: 'app'; action: 'help' | 'playground' | 'hand-left' | 'hand-right' };

/** What the parser and the descriptions know of the drawing: preset names, and the layers bottom first. */
export type CommandContext = {
  presets: readonly { id: string; name: string }[];
  layers: readonly { name: string }[];
};

/**
 * Reads a typed or spoken command: one or more clauses joined by commas, `and` or `then` (`dark blue, size 12`), each
 * a phrase such as `size 24`, `bigger`, `opacity 50`, `red`, `#ff8800`, `new layer`, `hide layer 2`,
 * `layer 3 opacity 40`, `zoom 200`, `rotate 0`, `mirror`, `symmetry radial 8`, `quickshape off`,
 * `quickshape hold 700`, `undo 5` or `export png`, or a
 * preset's or layer's exact name. Polite and filler words (`please`, `set`, `switch to`, `use`) and number words up
 * to ninety-nine are understood. Returns the intents in order, or `undefined` when any clause is not understood, so
 * a command never runs half of what was asked.
 */
export function parseCommand(text: string, context: CommandContext): Intent[] | undefined {
  const clauses = text
    .split(/\s*(?:[,;]|\band then\b|\bthen\b|\band\b)\s*/i)
    .map(normalize)
    .filter((clause) => clause.length > 0);
  if (clauses.length === 0) {
    return undefined;
  }

  const intents: Intent[] = [];
  for (const clause of clauses) {
    const intent = parseClause(clause, context);
    if (!intent) {
      return undefined;
    }

    intents.push(intent);
  }

  return intents;
}

/**
 * A short line saying what `intent` does, for the palette's rows, its Enter preview and the toast after it ran:
 * `Brush 24 px`, `Opacity 50%`, `Hide Layer 2`. Layers are named from `context` when they exist.
 */
export function describeIntent(intent: Intent, context: CommandContext): string {
  const layer = (index: number | undefined) =>
    index === undefined ? 'the layer' : (context.layers[index - 1]?.name ?? `layer ${index}`);
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  switch (intent.type) {
    case 'tool':
      return toolNames[intent.tool];
    case 'selection-tool':
      return selectionToolNames[intent.tool];
    case 'transform':
      return 'Transform';
    case 'preset':
      return intent.name;
    case 'size':
      return `Brush ${formatNumber(intent.px)} px`;
    case 'scale-size':
      // The usual steps, as `[` and `]` take them, read without a factor.
      if (intent.factor === 1.25 || intent.factor === 0.8) {
        return intent.factor > 1 ? 'Bigger brush' : 'Smaller brush';
      }

      return `${intent.factor > 1 ? 'Bigger' : 'Smaller'} brush ×${formatNumber(intent.factor)}`;
    case 'brush-value':
      return `${capitalize(intent.key)} ${percent(intent.value)}`;
    case 'color':
      return intent.name === intent.hex ? `Color ${intent.hex}` : `Color ${intent.name}`;
    case 'colors':
      return { swap: 'Swap colors', reset: 'Black and white', pick: 'Eyedropper' }[intent.action];
    case 'layer':
      return {
        add: 'New layer',
        duplicate: `Duplicate ${layer(intent.layer)}`,
        delete: `Delete ${layer(intent.layer)}`,
        'merge-down': `Merge ${layer(intent.layer)} down`,
        up: `Move ${layer(intent.layer)} up`,
        down: `Move ${layer(intent.layer)} down`,
        select: `Go to ${layer(intent.layer)}`
      }[intent.action];
    case 'layer-flag': {
      const names = {
        visible: ['Show', 'Hide', 'Show or hide'],
        alphaLock: ['Lock alpha of', 'Unlock alpha of', 'Toggle alpha lock of'],
        clipping: ['Clip', 'Unclip', 'Toggle clipping of']
      }[intent.flag];
      const verb = intent.value === undefined ? names[2] : intent.value ? names[0] : names[1];
      return `${verb} ${layer(intent.layer)}`;
    }
    case 'layer-opacity':
      return `${intent.layer === undefined ? 'Layer' : layer(intent.layer)} opacity ${percent(intent.value)}`;
    case 'layer-blend':
      return `${intent.layer === undefined ? 'Blend mode' : `${layer(intent.layer)} blend mode`} ${capitalize(intent.blend)}`;
    case 'layer-rename':
      return `Rename ${layer(intent.layer)} to “${intent.name}”`;
    case 'selection':
      return selectionNames[intent.action];
    case 'feather':
      return `Feather ${formatNumber(intent.px)} px`;
    case 'zoom':
      return `Zoom ${formatNumber(intent.percent)}%`;
    case 'zoom-by':
      return intent.factor > 1 ? 'Zoom in' : 'Zoom out';
    case 'rotate':
      return intent.relative
        ? `Rotate ${Math.abs(intent.degrees)}° ${intent.degrees < 0 ? 'left' : 'right'}`
        : `Rotate to ${formatNumber(intent.degrees)}°`;
    case 'view':
      return {
        reset: 'Reset the view',
        mirror: 'Mirror the view',
        fullscreen: 'Full screen',
        'pixel-grid': 'Pixel grid'
      }[intent.action];
    case 'window':
      return {
        palette: 'Mixing palette',
        pen: 'Pen and palm rejection',
        pressure: 'Calibrate pen pressure'
      }[intent.window];
    case 'symmetry':
      return intent.mode === 'off'
        ? 'Symmetry off'
        : `Symmetry ${symmetryNames[intent.mode]}${intent.segments === undefined ? '' : ` · ${intent.segments}`}`;
    case 'quickshape':
      if (intent.delay !== undefined) {
        return `QuickShape hold ${formatNumber(intent.delay)} ms`;
      }

      return intent.enabled === undefined ? 'QuickShape on or off' : `QuickShape ${intent.enabled ? 'on' : 'off'}`;
    case 'history':
      return `${capitalize(intent.action)}${intent.count > 1 ? ` ×${intent.count}` : ''}`;
    case 'file':
      return {
        png: 'Export PNG',
        psd: 'Export PSD',
        download: 'Save .paint',
        open: 'Open a drawing',
        insert: 'Insert an image',
        abr: 'Import ABR brushes'
      }[intent.action];
    case 'mixer':
      return { load: 'Load the brush', clean: 'Clean the brush', pick: 'Load paint from the canvas' }[intent.action];
    case 'app':
      return {
        help: 'Help',
        playground: 'Back to the playground',
        'hand-left': 'Left-handed',
        'hand-right': 'Right-handed'
      }[intent.action];
  }
}

/** The palette group an intent is listed under. */
export function groupOf(intent: Intent): string {
  switch (intent.type) {
    case 'tool':
    case 'selection-tool':
    case 'transform':
      return 'Tool';
    case 'preset':
    case 'size':
    case 'scale-size':
    case 'brush-value':
    case 'quickshape':
      return 'Brush';
    case 'color':
    case 'colors':
      return 'Color';
    case 'layer':
    case 'layer-flag':
    case 'layer-opacity':
    case 'layer-blend':
    case 'layer-rename':
      return 'Layer';
    case 'selection':
    case 'feather':
      return 'Selection';
    case 'zoom':
    case 'zoom-by':
    case 'rotate':
    case 'view':
      return 'View';
    case 'symmetry':
      return 'Symmetry';
    case 'history':
      return 'History';
    case 'file':
      return 'File';
    case 'mixer':
      return 'Mixer';
    case 'window':
    case 'app':
      return 'Paint';
  }
}

/**
 * Commands worth running several times in a row, such as Undo, a size or zoom step or moving a layer, which keep a
 * palette or the type-ahead open when tapped.
 */
export function repeatable(intent: Intent) {
  return (
    intent.type === 'history' ||
    intent.type === 'scale-size' ||
    intent.type === 'zoom-by' ||
    (intent.type === 'rotate' && intent.relative === true) ||
    (intent.type === 'layer' && (intent.action === 'up' || intent.action === 'down')) ||
    intent.type === 'layer-flag'
  );
}

/** A stable key of an intent, for comparing and deduplicating. */
export function intentKey(intent: Intent) {
  return JSON.stringify(intent);
}

/** Parses one clause, already normalized; rules are tried in order and the first that understands it wins. */
function parseClause(clause: string, context: CommandContext): Intent | undefined {
  for (const [pattern, read] of rules) {
    const match = pattern.exec(clause);
    if (!match) {
      continue;
    }

    const intent = read(match, context);
    if (intent) {
      return intent;
    }
  }

  return undefined;
}

/**
 * Lower-case words, spelled numbers as digits, without polite and filler words or a closing full stop, so that
 * `Please set the size to twenty four.` reads `size 24`. Case is kept for layer names, which only rename uses.
 */
function normalize(clause: string) {
  let text = clause
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '');
  text = digits(text);
  let previous;
  do {
    previous = text;
    text = text
      .replace(/^(?:please|ok|okay|now|can you|could you|i want|i'd like|give me|let's)\s+/i, '')
      .replace(/^(?:set|make|switch to|change|use|go to|choose)\s+(?=\S)/i, '')
      .replace(/^(?:it|the|my)\s+/i, '')
      .replace(/\s+please$/i, '')
      .replace(/^(?:please|ok|okay|now|so|um|uh|hey|thanks|thank you)$/i, '');
  } while (text !== previous);

  return text;
}

/** Spelled numbers below a hundred as digits: `twenty four` reads `24`, `eight` reads `8`. */
function digits(text: string) {
  return text.replace(
    new RegExp(
      `\\b(?:(${tensWords.join('|')})(?:[\\s-](${unitWords.slice(1, 10).join('|')}))?|(${unitWords.join('|')}))\\b`,
      'gi'
    ),
    (_word, tens: string | undefined, unit: string | undefined, single: string | undefined) => {
      if (single) {
        return String(unitWords.indexOf(single.toLowerCase()));
      }

      return String(
        (tensWords.indexOf(tens!.toLowerCase()) + 2) * 10 + (unit ? unitWords.indexOf(unit.toLowerCase()) : 0)
      );
    }
  );
}

const unitWords = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
];
const tensWords = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A clause pattern and how it reads its match; returning `undefined` lets later rules try. */
type Rule = readonly [RegExp, (match: RegExpExecArray, context: CommandContext) => Intent | undefined];

const number = String.raw`(\d+(?:\.\d+)?)`;
const percentUnit = String.raw`\s*(?:%|percent|per cent)?`;
const layerRef = String.raw`(?:\s+(?:the\s+)?layer)?(?:\s+(\d+))?`;

/** The parsing rules, most specific first; the color and name rules come last as they accept almost anything. */
const rules: Rule[] = [
  [/^(undo|redo)(?:\s*(?:x|×)?\s*(\d+)(?:\s*times?)?)?$/i, (m) => history(m[1]!, m[2])],
  [/^(?:the\s+)?(?:brush|paint|pen|draw|drawing)(?:\s+tool)?$/i, () => ({ type: 'tool', tool: 'brush' })],
  [/^(?:the\s+)?(?:eraser|erase|rubber)(?:\s+tool)?$/i, () => ({ type: 'tool', tool: 'eraser' })],
  [/^(?:fill(?:\s+tool)?|(?:paint\s+)?bucket)$/i, () => ({ type: 'tool', tool: 'fill' })],
  [/^gradient(?:\s+tool)?$/i, () => ({ type: 'tool', tool: 'gradient' })],
  [
    /^(?:free\s*hand|lasso|select|selection)(?:\s+(?:lasso|tool))?$/i,
    () => ({ type: 'selection-tool', tool: 'lasso' })
  ],
  [
    /^(polygon|polygonal|rectangle|rectangular|rect|square|box|ellipse|elliptical|oval|circle|wand|magic wand|automatic|auto)(?:\s+(?:select|selection|lasso|marquee))?(?:\s+tool)?$/i,
    (m) => ({ type: 'selection-tool', tool: selectionToolWords[m[1]!.toLowerCase()]! })
  ],
  [/^(?:free\s+)?transform$|^move$/i, () => ({ type: 'transform' })],
  [/^(?:eye\s*dropper|color\s*picker|picker|pick(?:\s+a)?\s+colou?r|sample(?:\s+colou?r)?)$/i, () => colors('pick')],
  [/^(?:swap|switch|exchange)(?:\s+(?:the\s+)?colou?rs)?$/i, () => colors('swap')],
  [/^(?:reset|default)\s+colou?rs$/i, () => colors('reset')],
  [
    new RegExp(
      String.raw`^(?:brush\s+)?(?:size|radius|diameter|width|brush)\s*(?:to\s+|=\s*|of\s+)?${number}\s*(?:px|pixels?)?$`,
      'i'
    ),
    (m) => size(m[1]!)
  ],
  [new RegExp(String.raw`^${number}\s*(?:px|pixels?)?$`, 'i'), (m) => size(m[1]!)],
  [new RegExp(String.raw`^(?:brush\s+)?(?:size\s*)?(?:x|×|\*|times)\s*${number}$`, 'i'), (m) => scale(Number(m[1]))],
  [/^double(?:\s+(?:the\s+)?size)?$/i, () => scale(2)],
  [/^half(?:\s+(?:the\s+)?size)?$|^halve(?:\s+(?:the\s+)?size)?$/i, () => scale(0.5)],
  [
    /^(much\s+|a lot\s+|a bit\s+|slightly\s+|a little\s+)?(bigger|larger|thicker|wider|smaller|thinner|narrower)(?:\s+brush)?$/i,
    (m) => {
      const grow = /bigger|larger|thicker|wider/i.test(m[2]!);
      const strength = m[1] ? (/much|a lot/i.test(m[1]) ? 2 : 1.1) : 1.25;
      return scale(grow ? strength : 1 / strength);
    }
  ],
  [
    /^(?:size|brush)\s+(up|down)$|^(increase|decrease)\s+(?:the\s+)?size$/i,
    (m) => scale(/up|increase/i.test(m[0]) ? 1.25 : 0.8)
  ],
  [
    new RegExp(String.raw`^(?:brush\s+)?(opacity|alpha|flow|hardness)\s*(?:to\s+|=\s*)?${number}${percentUnit}$`, 'i'),
    (m) =>
      brushValue(
        m[1]!.toLowerCase() === 'alpha' ? 'opacity' : (m[1]!.toLowerCase() as 'opacity' | 'flow' | 'hardness'),
        m[2]!
      )
  ],
  [
    new RegExp(String.raw`^${number}\s*(?:%|percent|per cent)(?:\s+opacity)?$`, 'i'),
    (m) => brushValue('opacity', m[1]!)
  ],
  [
    /^(?:(?:new|add|create)(?:\s+a)?(?:\s+new)?|an?\s+new)\s+layer$|^layer\s+(?:new|add)$/i,
    () => ({ type: 'layer', action: 'add' })
  ],
  [
    new RegExp(String.raw`^(?:duplicate|clone|copy)${layerRef}$`, 'i'),
    (m, c) => (/^copy$/i.test(m[0]) ? undefined : layerAction('duplicate', m[1], c))
  ],
  [
    new RegExp(String.raw`^(?:delete|remove|trash)\s+(?:the\s+)?layer(?:\s+(\d+))?$`, 'i'),
    (m, c) => layerAction('delete', m[1], c)
  ],
  [
    new RegExp(String.raw`^merge(?:\s+(?:the\s+)?layer)?(?:\s+(\d+))?(?:\s+down)?$`, 'i'),
    (m, c) => layerAction('merge-down', m[1], c)
  ],
  [
    /^(?:move\s+)?(?:the\s+)?layer(?:\s+(\d+))?\s+(up|down|higher|lower|above|below)$/i,
    (m, c) => layerAction(/up|higher|above/i.test(m[2]!) ? 'up' : 'down', m[1], c)
  ],
  [/^(?:select\s+|go\s+to\s+|switch\s+to\s+)?layer\s+(\d+)$/i, (m, c) => layerAction('select', m[1], c)],
  [
    new RegExp(String.raw`^(hide|show|unhide)${layerRef}$`, 'i'),
    (m, c) => withLayer({ type: 'layer-flag', flag: 'visible', value: !/^hide$/i.test(m[1]!) }, m[2], c)
  ],
  [
    /^(hide|show|unhide)\s+(.+)$/i,
    (m, c) =>
      byName(m[2]!, c, (layer) => ({ type: 'layer-flag', flag: 'visible', value: !/^hide$/i.test(m[1]!), layer }))
  ],
  [/^(?:toggle\s+)?(?:visibility|visible)$/i, () => ({ type: 'layer-flag', flag: 'visible' })],
  [
    new RegExp(String.raw`^layer(?:\s+(\d+))?\s+(?:opacity|alpha)\s*(?:to\s+|=\s*)?${number}${percentUnit}$`, 'i'),
    (m, c) => withLayer({ type: 'layer-opacity', value: fraction(m[2]!) }, m[1], c)
  ],
  [
    /^(?:layer(?:\s+(\d+))?\s+)?(?:blend(?:ing)?(?:\s+mode)?\s+)?(normal|multiply|screen|overlay)(?:\s+blend(?:ing)?(?:\s+mode)?)?$/i,
    (m, c) => withLayer({ type: 'layer-blend', blend: m[2]!.toLowerCase() as BlendMode }, m[1], c)
  ],
  [
    /^rename(?:\s+(?:the\s+)?layer)?(?:\s+(\d+))?(?:\s+(?:to|as))?\s+(.+)$/i,
    (m, c) => withLayer({ type: 'layer-rename', name: m[2]!.trim().slice(0, 64) }, m[1], c)
  ],
  [
    new RegExp(String.raw`^(un)?lock(?:\s+alpha|\s+transparency)?${layerRef}$|^alpha\s+(un)?lock${layerRef}$`, 'i'),
    (m, c) => withLayer({ type: 'layer-flag', flag: 'alphaLock', value: !(m[1] ?? m[3]) }, m[2] ?? m[4], c)
  ],
  [
    new RegExp(String.raw`^(un)?clip(?:ping)?(?:\s+mask)?${layerRef}$`, 'i'),
    (m, c) => withLayer({ type: 'layer-flag', flag: 'clipping', value: !m[1] }, m[2], c)
  ],
  [/^select\s+all$|^all$/i, () => selection('all')],
  [
    /^(?:deselect|select\s+none|unselect|clear\s+(?:the\s+)?selection|drop(?:\s+the)?\s+selection|none)$/i,
    () => selection('none')
  ],
  [/^(?:invert(?:\s+(?:the\s+)?selection)?|select\s+inverse|inverse)$/i, () => selection('invert')],
  [
    new RegExp(String.raw`^feather(?:\s+(?:the\s+)?selection)?(?:\s+by)?(?:\s*${number}\s*(?:px|pixels?)?)?$`, 'i'),
    (m) => ({ type: 'feather', px: clamp(Math.round(Number(m[1] ?? 8)), 1, 250) })
  ],
  [
    /^(copy|cut|paste)(?:\s+(?:the\s+)?selection)?$/i,
    (m) => selection(m[1]!.toLowerCase() as 'copy' | 'cut' | 'paste')
  ],
  [/^(?:delete|clear|erase)(?:\s+(?:the\s+)?(?:selection|selected))?$/i, () => selection('delete')],
  [
    /^(?:selection\s+to\s+(?:a\s+)?(?:new\s+)?layer|new\s+layer\s+from\s+(?:the\s+)?selection|copy\s+to\s+(?:a\s+)?(?:new\s+)?layer|lift)$/i,
    () => selection('new-layer')
  ],
  [/^(?:colou?r\s+)?fill\s+(?:the\s+)?selection$|^colou?r\s+fill$/i, () => selection('fill')],
  [new RegExp(String.raw`^zoom(?:\s+(?:to|at))?\s*${number}${percentUnit}$`, 'i'), (m) => zoom(Number(m[1]))],
  [new RegExp(String.raw`^${number}\s*(?:%|percent)\s+zoom$`, 'i'), (m) => zoom(Number(m[1]))],
  [/^(?:actual|real)\s+size$|^1:1$/i, () => zoom(100)],
  [
    /^zoom\s+(in|out)$|^(closer|further|farther)$/i,
    (m) => ({ type: 'zoom-by', factor: /in|closer/i.test(m[0]) ? 1.25 : 0.8 })
  ],
  [
    /^(?:reset|home|center|recenter|re-center)(?:\s+(?:the\s+)?(?:view|canvas|camera))?$|^fit$/i,
    () => ({ type: 'view', action: 'reset' })
  ],
  [
    new RegExp(
      String.raw`^rotate(?:\s+(?:the\s+)?(?:view|canvas))?(?:\s+to)?\s*(-?\d+(?:\.\d+)?)\s*(?:°|deg(?:rees?)?)?$`,
      'i'
    ),
    (m) => ({ type: 'rotate', degrees: normalizeDegrees(Number(m[1])) })
  ],
  [
    /^rotate(?:\s+(?:the\s+)?(?:view|canvas))?\s+(left|right|clockwise|counter\s*clockwise|anti\s*clockwise)$|^turn\s+(left|right)$/i,
    (m) => ({ type: 'rotate', degrees: /^(?:right|clockwise)$/i.test(m[1] ?? m[2]!) ? 15 : -15, relative: true })
  ],
  [/^(?:reset\s+(?:the\s+)?rotation|straighten|unrotate|level|upright)$/i, () => ({ type: 'rotate', degrees: 0 })],
  [
    /^(?:mirror|flip)(?:\s+(?:the\s+)?(?:view|canvas|image))?(?:\s+horizontally)?$/i,
    () => ({ type: 'view', action: 'mirror' })
  ],
  [/^full\s*screen$/i, () => ({ type: 'view', action: 'fullscreen' })],
  [/^pixel\s+grid$/i, () => ({ type: 'view', action: 'pixel-grid' })],
  [
    /^(?:(?:open|show|close|hide)\s+(?:the\s+)?)?(?:mixing\s+)?palette$|^mix(?:ing)?(?:\s+paint)?$/i,
    () => ({ type: 'window', window: 'palette' })
  ],
  [
    /^(?:(?:open|show)\s+(?:the\s+)?)?(?:pen\s+settings|palm(?:\s+rejection)?|pen\s+hover)$/i,
    () => ({ type: 'window', window: 'pen' })
  ],
  [
    /^(?:(?:open|show)\s+(?:the\s+)?)?(?:calibrate\s+(?:the\s+)?(?:pen(?:\s+pressure)?|pressure)|(?:pen\s+)?pressure(?:\s+(?:calibration|curve))?)$/i,
    () => ({ type: 'window', window: 'pressure' })
  ],
  [
    /^(?:symmetry|sym|mirror\s+mode)(?:\s+(off|none|vertical|horizontal|quadrant|dual|4[\s-]*way|diagonal|radial|mandala|kaleidoscope))?(?:\s+(\d+))?$/i,
    (m) => symmetry(m[1] ?? (m[2] ? 'radial' : 'vertical'), m[2])
  ],
  [
    /^(vertical|horizontal|quadrant|diagonal|radial|mandala|kaleidoscope)(?:\s+symmetry)?(?:\s+(\d+))?$/i,
    (m) => symmetry(m[1]!, m[2])
  ],
  [/^(\d+)[\s-]*(?:way|fold)(?:\s+symmetry)?$/i, (m) => symmetry('radial', m[1])],
  [/^(?:no|stop|disable)\s+symmetry$/i, () => symmetry('off')],
  [
    /^quick\s*shapes?(?:\s+(on|off))?$|^(?:turn\s+)?(on|off)\s+quick\s*shapes?$/i,
    (m) => {
      const word = (m[1] ?? m[2])?.toLowerCase();
      return word === undefined ? { type: 'quickshape' } : { type: 'quickshape', enabled: word === 'on' };
    }
  ],
  [/^(enable|disable|no)\s+quick\s*shapes?$/i, (m) => ({ type: 'quickshape', enabled: /^enable$/i.test(m[1]!) })],
  [
    /^quick\s*shapes?\s+(?:hold|delay)(?:\s+to)?\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)?$/i,
    (m) => {
      const ms = Number(m[1]) * (m[2] && !/^m/i.test(m[2]) ? 1000 : 1);
      return { type: 'quickshape', delay: clamp(Math.round(ms), minimumDelay, maximumDelay) };
    }
  ],
  [
    /^(?:export|save|download|share)(?:\s+(?:as|to))?(?:\s+an?)?\s+(png|psd|paint|image|photoshop|picture)$/i,
    (m) =>
      file(
        ({ png: 'png', image: 'png', picture: 'png', psd: 'psd', photoshop: 'psd', paint: 'download' } as const)[
          m[1]!.toLowerCase() as 'png'
        ]
      )
  ],
  [/^(png|psd)$/i, (m) => file(m[1]!.toLowerCase() as 'png' | 'psd')],
  [/^(?:save|download)$/i, () => file('download')],
  [/^(?:open|import)(?:\s+(?:a\s+)?(?:file|drawing|paint\s+file|psd))?$/i, () => file('open')],
  [/^(?:insert|place|add)(?:\s+an?)?\s+(?:image|photo|picture)$|^(?:image|photo|picture)$/i, () => file('insert')],
  [/^(?:import\s+)?(?:abr|brushes|abr\s+brushes|brush\s+pack)$|^import\s+brushes$/i, () => file('abr')],
  [/^(?:load|wet)(?:\s+the)?\s+brush$/i, () => mixer('load')],
  [/^(?:clean|wash)(?:\s+the)?\s+brush$/i, () => mixer('clean')],
  [/^(?:load|pick)\s+paint(?:\s+from\s+(?:the\s+)?canvas)?$/i, () => mixer('pick')],
  [/^(?:help|\?|commands|what can i (?:say|do|type))$/i, () => app('help')],
  [/^left[\s-]*hand(?:ed)?$/i, () => app('hand-left')],
  [/^right[\s-]*hand(?:ed)?$/i, () => app('hand-right')],
  [/^(?:playground|experiments|exit|quit|back\s+to\s+(?:the\s+)?playground)$/i, () => app('playground')],
  [
    /^(?:brush\s+|preset\s+)?(.+)$/i,
    (m, c) => {
      const name = m[1]!.toLowerCase();
      const preset = c.presets.find((candidate) => candidate.name.toLowerCase() === name);
      return preset && { type: 'preset', id: preset.id, name: preset.name };
    }
  ],
  [
    /^(?:colou?r|paint(?:\s+in)?)?\s*(?:to\s+)?(.+)$/i,
    (m) => {
      const color = parseColor(m[1]!);
      return color && { type: 'color', hex: color.hex, name: color.name };
    }
  ],
  [/^(?:layer\s+)?(.+)$/i, (m, c) => byName(m[1]!, c, (layer) => ({ type: 'layer', action: 'select', layer }))]
];

function history(action: string, count: string | undefined): Intent {
  return {
    type: 'history',
    action: action.toLowerCase() as 'undo' | 'redo',
    count: clamp(Math.round(Number(count ?? 1)), 1, 50)
  };
}

function colors(action: 'swap' | 'reset' | 'pick'): Intent {
  return { type: 'colors', action };
}

function size(value: string): Intent | undefined {
  const px = Number(value);
  return px > 0 ? { type: 'size', px: clamp(Math.round(px * 10) / 10, 0.5, 5000) } : undefined;
}

function scale(factor: number): Intent | undefined {
  return factor > 0 && factor !== 1 ? { type: 'scale-size', factor: clamp(factor, 0.05, 20) } : undefined;
}

function brushValue(key: 'opacity' | 'flow' | 'hardness', value: string): Intent {
  return { type: 'brush-value', key, value: Math.max(key === 'opacity' ? 0.01 : 0, fraction(value)) };
}

/** A typed amount as a fraction from 0 to 1: `50` and `50%` are one half, as is `0.5`. */
function fraction(value: string) {
  const amount = Number(value);
  return clamp(amount < 1 && value.includes('.') ? amount : amount / 100, 0, 1);
}

function layerAction(
  action: Extract<Intent, { type: 'layer' }>['action'],
  layer: string | undefined,
  context: CommandContext
): Intent | undefined {
  return withLayer({ type: 'layer', action }, layer, context);
}

/** Adds the layer number when given; `layer 0` does not exist and is not understood. */
function withLayer<T extends Intent>(intent: T, layer: string | undefined, _context: CommandContext): T | undefined {
  if (layer === undefined) {
    return intent;
  }

  const index = Number(layer);
  return index >= 1 ? { ...intent, layer: index } : undefined;
}

/** An intent for the layer named `name` exactly, ignoring case; the topmost one when names repeat. */
function byName(name: string, context: CommandContext, make: (layer: number) => Intent): Intent | undefined {
  const wanted = name.trim().toLowerCase();
  for (let index = context.layers.length - 1; index >= 0; index--) {
    if (context.layers[index]!.name.toLowerCase() === wanted) {
      return make(index + 1);
    }
  }

  return undefined;
}

function selection(action: Extract<Intent, { type: 'selection' }>['action']): Intent {
  return { type: 'selection', action };
}

function zoom(percent: number): Intent | undefined {
  return percent > 0 ? { type: 'zoom', percent: clamp(percent, 5, 3200) } : undefined;
}

/** Degrees in the range −180 to 180, so `rotate 270` reads `rotate to −90°`. */
function normalizeDegrees(degrees: number) {
  const turned = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return turned === -180 ? 180 : turned;
}

/** Symmetry from a mode word and an optional segment count, kept within what the engine accepts. */
function symmetry(word: string, segments?: string): Intent {
  const mode = symmetryWords[word.toLowerCase().replace(/[\s-]+/g, '')] ?? 'vertical';
  if (mode !== 'radial' && mode !== 'mandala') {
    return { type: 'symmetry', mode };
  }

  const [min, max] = mode === 'mandala' ? [3, 10] : [2, 12];
  return { type: 'symmetry', mode, segments: clamp(Math.round(Number(segments ?? 6)), min, max) };
}

function file(action: Extract<Intent, { type: 'file' }>['action']): Intent {
  return { type: 'file', action };
}

function mixer(action: 'load' | 'clean' | 'pick'): Intent {
  return { type: 'mixer', action };
}

function app(action: Extract<Intent, { type: 'app' }>['action']): Intent {
  return { type: 'app', action };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** A number without trailing zeros: `24`, `2.5`. */
function formatNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const toolNames = { brush: 'Brush', eraser: 'Eraser', fill: 'Fill', gradient: 'Gradient' } as const;

const selectionToolNames: Record<SelectionTool, string> = {
  lasso: 'Lasso',
  polygon: 'Polygon selection',
  rectangle: 'Rectangle selection',
  ellipse: 'Ellipse selection',
  wand: 'Magic wand'
};

const selectionToolWords: Record<string, SelectionTool> = {
  polygon: 'polygon',
  polygonal: 'polygon',
  rectangle: 'rectangle',
  rectangular: 'rectangle',
  rect: 'rectangle',
  square: 'rectangle',
  box: 'rectangle',
  ellipse: 'ellipse',
  elliptical: 'ellipse',
  oval: 'ellipse',
  circle: 'ellipse',
  wand: 'wand',
  'magic wand': 'wand',
  automatic: 'wand',
  auto: 'wand'
};

const selectionNames: Record<Extract<Intent, { type: 'selection' }>['action'], string> = {
  all: 'Select all',
  none: 'Deselect',
  invert: 'Invert the selection',
  fill: 'Fill the selection',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  delete: 'Delete the selected paint',
  move: 'Move the selection',
  'new-layer': 'Selection to a new layer'
};

const symmetryWords: Record<string, PaintSymmetry['mode']> = {
  off: 'off',
  none: 'off',
  vertical: 'vertical',
  horizontal: 'horizontal',
  quadrant: 'dual',
  dual: 'dual',
  '4way': 'dual',
  diagonal: 'diagonal',
  radial: 'radial',
  mandala: 'mandala',
  kaleidoscope: 'mandala'
};

const symmetryNames: Record<PaintSymmetry['mode'], string> = {
  off: 'off',
  vertical: 'vertical',
  horizontal: 'horizontal',
  dual: 'quadrant',
  diagonal: 'diagonal',
  radial: 'radial',
  mandala: 'mandala'
};
