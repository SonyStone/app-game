import { maxStabilizerLevel } from '@app-game/paint-core/strokeSettings';
import type { SketchIconName } from '../../shared/ui/SketchIcon';

/** The mockup's tools in the order of the 3×3 tools tile. Only the brush, the mixer and the eraser draw. */
export const tools = [
  { id: 'brush', label: 'Brush', icon: 'draw' },
  { id: 'mixer', label: 'Mixer brush', icon: 'feather' },
  { id: 'eraser', label: 'Eraser', icon: 'erase' },
  { id: 'lasso', label: 'Lasso', icon: 'lasso' },
  { id: 'transform', label: 'Transform', icon: 'move' },
  { id: 'symmetry', label: 'Symmetry', icon: 'symmetry' },
  { id: 'fill', label: 'Fill', icon: 'fill' },
  { id: 'gradient', label: 'Gradient', icon: 'gradient' },
  { id: 'picker', label: 'Color picker', icon: 'picker' }
] as const satisfies readonly { id: string; label: string; icon: SketchIconName }[];

export type ToolId = (typeof tools)[number]['id'];

/**
 * The tiles each tool shows besides the fixed tools and navigation tiles: the color tile above, the presets or the
 * selection tile at the top of the side column, and the layers tile below it. Every tool has a settings tile.
 */
export const toolTiles: Record<ToolId, { color: boolean; side: 'presets' | 'selection' | undefined }> = {
  brush: { color: true, side: 'presets' },
  mixer: { color: true, side: 'presets' },
  eraser: { color: false, side: 'presets' },
  lasso: { color: false, side: 'selection' },
  transform: { color: false, side: undefined },
  symmetry: { color: false, side: undefined },
  fill: { color: true, side: undefined },
  gradient: { color: true, side: undefined },
  picker: { color: true, side: undefined }
};

/**
 * One control of a settings section, laid out four to a row. Numbers are value buttons whose grids offer `presets`
 * (or round values over the range), shown as brush-size dots with `sizes`; choices are choice buttons; toggles with
 * an `icon` take one place, others two.
 */
export type Field =
  | {
      kind: 'number';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      unit?: string;
      scale?: 'log';
      presets?: readonly number[];
      sizes?: boolean;
    }
  | { kind: 'toggle'; key: string; label: string; icon?: SketchIconName }
  | { kind: 'choice'; key: string; label: string; options: readonly string[] }
  /** Paint Tool SAI's stabilizer levels as a grid of buttons, shown while `key`'s mode is "SAI". */
  | { kind: 'stabilizer'; key: string; mode: string };

/** A group of fields, separated from the next by a line; `title` only names it in code. */
export type Section = { title: string; fields: readonly Field[] };

export type SettingValue = number | boolean | string;

const size: Field = {
  kind: 'number',
  key: 'size',
  label: 'Size',
  min: 1,
  max: 500,
  unit: 'px',
  scale: 'log',
  sizes: true
};

/** Pen pressure toggles for these settings, named `pressureSize` and so on. */
const pressure = (...keys: ('Size' | 'Opacity' | 'Flow')[]): Section => ({
  title: 'Pressure',
  fields: keys.map((key) => ({ kind: 'toggle', key: `pressure${key}`, label: key, icon: 'draw' }))
});

/** Smoothing of the stroke: the mode, and the SAI stabilizer level or the strength of the others. */
/** The brush's color mixing: Clear paints transparency, erasing with the same brush and preset. */
const colorMixing: Section = {
  title: 'Color mixing',
  fields: [{ kind: 'choice', key: 'mixing', label: 'Mixing', options: ['Normal', 'Clear'] }]
};

const smoothing: Section = {
  title: 'Smoothing',
  fields: [
    { kind: 'choice', key: 'smoothing', label: 'Smooth', options: ['Off', 'Studio', 'Leonardo', 'SAI'] },
    { kind: 'stabilizer', key: 'stabilizer', mode: 'smoothing' }
  ]
};

/** Each tool's settings sections, as the tool settings tile shows them. */
export const toolSections: Record<ToolId, readonly Section[]> = {
  brush: [
    {
      title: 'Stroke',
      fields: [
        size,
        { kind: 'number', key: 'opacity', label: 'Opacity', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'flow', label: 'Flow', min: 0, max: 100, unit: '%' },
        {
          kind: 'number',
          key: 'spacing',
          label: 'Spacing',
          min: 1,
          max: 200,
          unit: '%',
          scale: 'log',
          presets: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200]
        }
      ]
    },
    colorMixing,
    pressure('Size', 'Opacity', 'Flow'),
    smoothing,
    {
      title: 'Tip',
      fields: [
        { kind: 'number', key: 'hardness', label: 'Hardness', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'roundness', label: 'Round', min: 1, max: 100, unit: '%' },
        { kind: 'number', key: 'angle', label: 'Angle', min: -180, max: 180, unit: '°' }
      ]
    }
  ],
  mixer: [
    {
      title: 'Stroke',
      fields: [
        size,
        { kind: 'number', key: 'opacity', label: 'Opacity', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'hardness', label: 'Hardness', min: 0, max: 100, unit: '%' }
      ]
    },
    colorMixing,
    {
      title: 'Mixing',
      fields: [
        { kind: 'number', key: 'wet', label: 'Wet', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'load', label: 'Load', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'mix', label: 'Mix', min: 0, max: 100, unit: '%' },
        { kind: 'toggle', key: 'pressureSize', label: 'Size', icon: 'draw' },
        { kind: 'toggle', key: 'clean', label: 'Clean after stroke' },
        { kind: 'toggle', key: 'sampleAll', label: 'Sample all layers' }
      ]
    },
    smoothing
  ],
  eraser: [
    {
      title: 'Stroke',
      fields: [
        size,
        { kind: 'number', key: 'opacity', label: 'Strength', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'hardness', label: 'Hardness', min: 0, max: 100, unit: '%' },
        { kind: 'choice', key: 'source', label: 'Erase to', options: ['Clear', 'History'] }
      ]
    },
    pressure('Size'),
    smoothing
  ],
  lasso: [
    {
      title: 'Selection',
      fields: [
        { kind: 'choice', key: 'mode', label: 'Mode', options: ['New', 'Add', 'Sub', 'Int'] },
        { kind: 'number', key: 'feather', label: 'Feather', min: 0, max: 250, unit: 'px' },
        { kind: 'number', key: 'expand', label: 'Expand', min: -100, max: 100, unit: 'px' },
        { kind: 'toggle', key: 'antialias', label: 'Antialias' }
      ]
    }
  ],
  transform: [
    {
      title: 'Transform',
      fields: [
        { kind: 'choice', key: 'mode', label: 'Mode', options: ['Free', 'Distort', 'Persp', 'Warp'] },
        { kind: 'number', key: 'x', label: 'X', min: -5000, max: 5000, unit: 'px' },
        { kind: 'number', key: 'y', label: 'Y', min: -5000, max: 5000, unit: 'px' },
        { kind: 'number', key: 'width', label: 'W', min: 1, max: 1000, unit: '%' },
        { kind: 'number', key: 'height', label: 'H', min: 1, max: 1000, unit: '%' },
        { kind: 'number', key: 'angle', label: 'Angle', min: -180, max: 180, unit: '°' },
        { kind: 'choice', key: 'sampling', label: 'Sampling', options: ['Smooth', 'Pixels'] },
        { kind: 'toggle', key: 'proportions', label: 'Keep proportions' }
      ]
    }
  ],
  symmetry: [
    {
      title: 'Symmetry',
      fields: [
        { kind: 'choice', key: 'mode', label: 'Mode', options: ['Off', 'Mirror', 'Radial', 'Kaleido'] },
        { kind: 'number', key: 'segments', label: 'Segments', min: 2, max: 32 },
        { kind: 'number', key: 'angle', label: 'Angle', min: -180, max: 180, unit: '°' },
        { kind: 'toggle', key: 'guides', label: 'Show guides' }
      ]
    }
  ],
  fill: [
    {
      title: 'Fill',
      fields: [
        { kind: 'choice', key: 'sample', label: 'Sample', options: ['Layer', 'All layers'] },
        { kind: 'number', key: 'tolerance', label: 'Tolerance', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'expand', label: 'Expand', min: 0, max: 50, unit: 'px' },
        { kind: 'number', key: 'gaps', label: 'Gaps', min: 0, max: 50, unit: 'px' },
        { kind: 'number', key: 'opacity', label: 'Opacity', min: 0, max: 100, unit: '%' },
        { kind: 'toggle', key: 'antialias', label: 'Antialias' }
      ]
    }
  ],
  gradient: [
    {
      title: 'Gradient',
      fields: [
        { kind: 'choice', key: 'type', label: 'Type', options: ['Linear', 'Radial', 'Angle', 'Diamond'] },
        { kind: 'choice', key: 'colors', label: 'Colors', options: ['Fg → Bg', 'Fg → Clear'] },
        { kind: 'number', key: 'opacity', label: 'Opacity', min: 0, max: 100, unit: '%' },
        { kind: 'number', key: 'smooth', label: 'Smooth', min: 0, max: 100, unit: '%' },
        { kind: 'toggle', key: 'dither', label: 'Dither' }
      ]
    }
  ],
  picker: [
    {
      title: 'Picker',
      fields: [
        { kind: 'choice', key: 'sample', label: 'Sample', options: ['Layer', 'All layers'] },
        { kind: 'choice', key: 'area', label: 'Area', options: ['1 px', '3×3', '5×5', '11×11'] },
        { kind: 'toggle', key: 'loupe', label: 'Show loupe' }
      ]
    }
  ]
};

/** Every tool's settings before the user changes them. */
export const defaultSettings: Record<ToolId, Record<string, SettingValue>> = {
  brush: {
    size: 24,
    opacity: 100,
    flow: 80,
    spacing: 8,
    hardness: 80,
    roundness: 100,
    angle: 0,
    pressureSize: true,
    pressureOpacity: false,
    pressureFlow: false,
    smoothing: 'SAI',
    stabilizer: 3,
    mixing: 'Normal'
  },
  mixer: {
    mixing: 'Normal',
    size: 40,
    opacity: 100,
    hardness: 50,
    pressureSize: true,
    wet: 60,
    load: 40,
    mix: 50,
    clean: true,
    sampleAll: false,
    smoothing: 'Studio',
    stabilizer: 0
  },
  eraser: {
    size: 60,
    opacity: 100,
    hardness: 60,
    pressureSize: true,
    source: 'Clear',
    smoothing: 'Off',
    stabilizer: 0
  },
  lasso: { mode: 'New', feather: 0, expand: 0, antialias: true },
  transform: { mode: 'Free', x: 0, y: 0, width: 100, height: 100, angle: 0, sampling: 'Smooth', proportions: true },
  symmetry: { mode: 'Mirror', segments: 6, angle: 0, guides: true },
  fill: { sample: 'All layers', tolerance: 12, expand: 2, gaps: 0, opacity: 100, antialias: true },
  gradient: { type: 'Linear', colors: 'Fg → Bg', opacity: 100, smooth: 50, dither: true },
  picker: { sample: 'All layers', area: '1 px', loupe: true }
};

/** Brush presets of the presets tile; choosing one overwrites these settings of the current painting tool. */
export const presets = [
  { id: 'ink', name: 'Ink pen', settings: { size: 6, opacity: 100, hardness: 100 } },
  { id: 'gouache', name: 'Dry gouache', settings: { size: 48, opacity: 90, hardness: 70 } },
  { id: 'pencil', name: 'Pencil', settings: { size: 3, opacity: 75, hardness: 90 } },
  { id: 'marker', name: 'Marker', settings: { size: 22, opacity: 60, hardness: 95 } },
  { id: 'airbrush', name: 'Soft airbrush', settings: { size: 160, opacity: 35, hardness: 0 } },
  { id: 'chalk', name: 'Chalk', settings: { size: 30, opacity: 80, hardness: 40 } }
] as const;

/** SAI stabilizer levels by row, as Paint's brush panel lays them out. */
export const stabilizerRows = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14, 15],
  Array.from({ length: maxStabilizerLevel - 15 }, (_, index) => 16 + index)
];
