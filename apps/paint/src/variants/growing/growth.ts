/**
 * The growth rules of the Growing variant, as pure functions: which controls a user has earned from how they have
 * drawn so far. A new user has only the brush, the eraser and undo and redo; every other control arrives once a usage
 * counter crosses its threshold, when its keyboard shortcut is pressed, or when the user asks for it.
 */

/**
 * Every control that grows, in the dock's order from top to bottom (the file commands live in the menu). The order
 * is also the order in which arrival hints are shown when several are pending.
 */
export const features = [
  'swatches',
  'colorDisc',
  'size',
  'brushes',
  'layers',
  'layerBlend',
  'selection',
  'transform',
  'fill',
  'gradient',
  'symmetry',
  'view',
  'export'
] as const;

/** A control that arrives with use; see {@link features}. */
export type Feature = (typeof features)[number];

/** What the user has done so far, counted by the variant and kept between visits. */
export type Usage = {
  /** Brush strokes. */
  strokes: number;
  /** Eraser strokes, with the eraser tool or the pen's eraser end. */
  erases: number;
  /** Color changes: swatches, the disc, the eyedropper and the finger's hold. */
  colorPicks: number;
  /** Zoom, pan and rotate gestures. */
  navigations: number;
  /** Layer commands: adding, choosing, hiding, reordering, merging… */
  layerActions: number;
  /** Selections made. */
  selections: number;
  /** Taps on the brush or the eraser while it is already active, asking for more. */
  brushTaps: number;
  /** Controls unlocked by their keyboard shortcuts or by asking for them in the menu. */
  requested: readonly Feature[];
};

/** A number of {@link Usage}. */
export type Counter = Exclude<keyof Usage, 'requested'>;

/** The usage of someone who has not drawn yet. */
export const emptyUsage: Usage = {
  strokes: 0,
  erases: 0,
  colorPicks: 0,
  navigations: 0,
  layerActions: 0,
  selections: 0,
  brushTaps: 0,
  requested: []
};

/** One way to earn a control: `counter` reaching `at`. */
export type Condition = { counter: Counter; at: number };

/**
 * When each control grows: as soon as any of its conditions holds. Colors come first, after a handful of strokes;
 * the color disc after a few color changes; layers after much drawing or erasing; fill, gradient and transform once
 * selections are in use; selection and symmetry only late, or on request.
 */
export const growthRules: Record<Feature, readonly Condition[]> = {
  swatches: [{ counter: 'strokes', at: 5 }],
  colorDisc: [{ counter: 'colorPicks', at: 3 }],
  size: [{ counter: 'strokes', at: 12 }],
  brushes: [
    { counter: 'strokes', at: 20 },
    { counter: 'brushTaps', at: 2 }
  ],
  layers: [
    { counter: 'strokes', at: 40 },
    { counter: 'erases', at: 10 }
  ],
  layerBlend: [{ counter: 'layerActions', at: 3 }],
  selection: [{ counter: 'strokes', at: 100 }],
  transform: [
    { counter: 'selections', at: 1 },
    { counter: 'layerActions', at: 6 }
  ],
  fill: [{ counter: 'selections', at: 1 }],
  gradient: [{ counter: 'selections', at: 3 }],
  symmetry: [{ counter: 'strokes', at: 150 }],
  view: [{ counter: 'navigations', at: 2 }],
  export: [{ counter: 'strokes', at: 30 }]
};

/**
 * Controls that need another to make sense, and bring it along: the disc lives in the colors, blending in the
 * layers, and the fill and the gradient work only inside a selection.
 */
const requires: Partial<Record<Feature, readonly Feature[]>> = {
  colorDisc: ['swatches'],
  layerBlend: ['layers'],
  fill: ['selection'],
  gradient: ['selection']
};

/** The controls `usage` has earned, with the controls they require, in dock order. */
export function grownFeatures(usage: Usage): ReadonlySet<Feature> {
  const grown = new Set<Feature>();
  const add = (feature: Feature) => {
    grown.add(feature);
    requires[feature]?.forEach(add);
  };

  for (const feature of features) {
    if (usage.requested.includes(feature) || growthRules[feature].some((rule) => usage[rule.counter] >= rule.at)) {
      add(feature);
    }
  }

  return new Set(features.filter((feature) => grown.has(feature)));
}

/**
 * The arrival to introduce next: the welcome until it has been seen, then the first grown control, in dock order,
 * whose hint has not been dismissed; none while everything is shown, since nothing is arriving then.
 */
export function pendingHint(
  grown: ReadonlySet<Feature>,
  introduced: ReadonlySet<Feature | 'welcome'>,
  showEverything: boolean
): Feature | 'welcome' | undefined {
  if (showEverything) {
    return undefined;
  }

  if (!introduced.has('welcome')) {
    return 'welcome';
  }

  return features.find((feature) => grown.has(feature) && !introduced.has(feature));
}

/**
 * How far a locked control is from growing, for the menu's list of controls still to come: the nearest of its
 * conditions as "after 40 strokes · 12 to go".
 */
export function growthProgress(feature: Feature, usage: Usage) {
  const nearest = [...growthRules[feature]].sort(
    (a, b) => (a.at - usage[a.counter]) / a.at - (b.at - usage[b.counter]) / b.at
  )[0]!;
  const left = Math.max(0, nearest.at - usage[nearest.counter]);
  const [one, many] = counterNames[nearest.counter];
  return `after ${nearest.at === 1 ? `the first ${one}` : `${nearest.at} ${many}`} · ${left} to go`;
}

/** Each counter's name for one and for several. */
const counterNames: Record<Counter, readonly [string, string]> = {
  strokes: ['stroke', 'strokes'],
  erases: ['erased stroke', 'erased strokes'],
  colorPicks: ['color change', 'color changes'],
  navigations: ['zoom or pan', 'zooms or pans'],
  layerActions: ['layer change', 'layer changes'],
  selections: ['selection', 'selections'],
  brushTaps: ['tap on the active brush', 'taps on the active brush']
};

/** `usage` with `counter` raised by `by`. */
export function counted(usage: Usage, counter: Counter, by = 1): Usage {
  return { ...usage, [counter]: usage[counter] + by };
}

/** `usage` with `requested` controls added; the same object when all of them were requested before. */
export function requested(usage: Usage, wanted: readonly Feature[]): Usage {
  const added = [...new Set(wanted)].filter((feature) => !usage.requested.includes(feature));
  return added.length > 0 ? { ...usage, requested: [...usage.requested, ...added] } : usage;
}

/**
 * The controls a key press unlocks at once, because pressing a tool's shortcut is reaching for it: L and W the
 * selection, G the fill, X and D the colors, the brackets the size, Ctrl+T the transform, Ctrl+S the file commands,
 * Ctrl with `=`, `-` or `0` the view, and the selection shortcuts the selection. A letter typed on a non-Latin layout
 * counts by its physical key, as the editor's shortcuts do.
 */
export function shortcutFeatures(press: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): Feature[] {
  const typed = press.key.toLowerCase();
  const key =
    typed.length !== 1 || /[a-z[\]=+\-0]/.test(typed)
      ? typed
      : /^Key[A-Z]$/.test(press.code)
        ? press.code.slice(3).toLowerCase()
        : (({ BracketLeft: '[', BracketRight: ']' } as Record<string, string>)[press.code] ?? typed);
  const modifier = press.ctrlKey || press.metaKey;
  if (modifier) {
    const withModifier: Record<string, Feature[]> = {
      t: ['transform'],
      s: ['export'],
      '=': ['view'],
      '+': ['view'],
      '-': ['view'],
      '0': ['view'],
      a: ['selection'],
      d: ['selection']
    };
    return press.shiftKey && key === 'i' ? ['selection'] : (withModifier[key] ?? []);
  }

  if (press.altKey) {
    return [];
  }

  const plain: Record<string, Feature[]> = {
    l: ['selection'],
    w: ['selection'],
    g: ['fill'],
    x: ['swatches'],
    d: ['swatches'],
    '[': ['size'],
    ']': ['size']
  };
  return plain[key] ?? [];
}

/**
 * Usage read back from storage: unknown fields and controls are dropped and missing or broken counters start at 0,
 * so a stored value from another version still loads.
 */
export function parseUsage(stored: unknown): Usage {
  const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const count = (name: Counter) => {
    const value = record[name];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  };
  const wanted = Array.isArray(record.requested) ? record.requested : [];

  return {
    strokes: count('strokes'),
    erases: count('erases'),
    colorPicks: count('colorPicks'),
    navigations: count('navigations'),
    layerActions: count('layerActions'),
    selections: count('selections'),
    brushTaps: count('brushTaps'),
    requested: features.filter((feature) => wanted.includes(feature))
  };
}
