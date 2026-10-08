import { BRUSH_SIZE_PRESETS } from '../../../features/brush-size';
import type { SketchIconName } from '../../../shared/ui/SketchIcon';

/**
 * What the gallery's mock editor offers, shared by every variant: tools, each tool's settings, brush presets and a
 * palette. Variants choose how to present them; the values live in the studio (`createStudio`).
 */

/**
 * The tools, eight of them so that radial layouts get one per direction. Brush, mixer and eraser paint; the color
 * picker samples the drawing; the rest only demonstrate their settings.
 */
export const tools = [
  { id: 'brush', label: 'Brush', icon: 'brush', key: 'B', paints: true },
  { id: 'mixer', label: 'Mixer brush', icon: 'feather', key: 'M', paints: true },
  { id: 'eraser', label: 'Eraser', icon: 'erase', key: 'E', paints: true },
  { id: 'picker', label: 'Color picker', icon: 'picker', key: 'I', paints: false },
  { id: 'lasso', label: 'Lasso', icon: 'lasso', key: 'L', paints: false },
  { id: 'transform', label: 'Transform', icon: 'move', key: 'T', paints: false },
  { id: 'fill', label: 'Fill', icon: 'fill', key: 'G', paints: false },
  { id: 'gradient', label: 'Gradient', icon: 'gradient', key: 'D', paints: false }
] as const satisfies readonly { id: string; label: string; icon: SketchIconName; key: string; paints: boolean }[];

export type ToolId = (typeof tools)[number]['id'];

/** Whether a tool uses the current color, so that variants can show the color only when it matters. */
export function usesColor(tool: ToolId) {
  return tool === 'brush' || tool === 'mixer' || tool === 'picker' || tool === 'fill' || tool === 'gradient';
}

/**
 * One setting of a tool. Numbers have a range and a unit; `scale: 'log'` ranges (sizes, spacing) are best adjusted
 * geometrically, and `presets` are good values to offer as stops. `short` is a two- or three-letter label for tight
 * layouts. Choices list their options; toggles are on or off.
 */
export type Setting =
  | {
      kind: 'number';
      key: string;
      label: string;
      short: string;
      min: number;
      max: number;
      unit: string;
      scale?: 'log';
      presets: readonly number[];
    }
  | { kind: 'choice'; key: string; label: string; short: string; options: readonly string[] }
  | { kind: 'toggle'; key: string; label: string; short: string; icon?: SketchIconName };

export type SettingValue = number | string | boolean;

const percent = (key: string, label: string, short: string): Setting => ({
  kind: 'number',
  key,
  label,
  short,
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]
});

const size: Setting = {
  kind: 'number',
  key: 'size',
  label: 'Size',
  short: 'Sz',
  min: 0.7,
  max: 1000,
  unit: 'px',
  scale: 'log',
  presets: BRUSH_SIZE_PRESETS.filter((value) => value <= 1000)
};

const spacing: Setting = {
  kind: 'number',
  key: 'spacing',
  label: 'Spacing',
  short: 'Sp',
  min: 1,
  max: 200,
  unit: '%',
  scale: 'log',
  presets: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200]
};

const angle: Setting = {
  kind: 'number',
  key: 'angle',
  label: 'Angle',
  short: 'An',
  min: -180,
  max: 180,
  unit: '°',
  presets: [-180, -135, -90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 135, 180]
};

const smoothing = percent('smoothing', 'Smoothing', 'Sm');
const pressureSize: Setting = {
  kind: 'toggle',
  key: 'pressureSize',
  label: 'Pressure → size',
  short: 'P·Sz',
  icon: 'draw'
};
const pressureOpacity: Setting = {
  kind: 'toggle',
  key: 'pressureOpacity',
  label: 'Pressure → opacity',
  short: 'P·Op',
  icon: 'draw'
};

/** Each tool's settings in the order panels list them; the first ones matter most. */
export const toolSettings: Record<ToolId, readonly Setting[]> = {
  brush: [
    size,
    percent('opacity', 'Opacity', 'Op'),
    percent('flow', 'Flow', 'Fl'),
    percent('hardness', 'Hardness', 'Hd'),
    smoothing,
    spacing,
    pressureSize,
    pressureOpacity,
    angle,
    percent('roundness', 'Roundness', 'Rn')
  ],
  mixer: [
    size,
    percent('opacity', 'Opacity', 'Op'),
    percent('wet', 'Wet', 'Wt'),
    percent('load', 'Load', 'Ld'),
    percent('hardness', 'Hardness', 'Hd'),
    smoothing,
    pressureSize
  ],
  eraser: [size, percent('opacity', 'Opacity', 'Op'), percent('hardness', 'Hardness', 'Hd'), smoothing, pressureSize],
  picker: [
    { kind: 'choice', key: 'sample', label: 'Sample', short: 'Smp', options: ['All layers', 'Current layer'] },
    { kind: 'choice', key: 'area', label: 'Area', short: 'Ar', options: ['Point', '3 × 3', '5 × 5'] }
  ],
  lasso: [
    { kind: 'choice', key: 'mode', label: 'Mode', short: 'Md', options: ['New', 'Add', 'Subtract', 'Intersect'] },
    {
      kind: 'number',
      key: 'feather',
      label: 'Feather',
      short: 'Fe',
      min: 0,
      max: 200,
      unit: 'px',
      presets: [0, 1, 2, 4, 8, 16, 32, 64, 128, 200]
    },
    { kind: 'toggle', key: 'antialias', label: 'Antialias', short: 'AA' }
  ],
  transform: [
    {
      kind: 'choice',
      key: 'mode',
      label: 'Mode',
      short: 'Md',
      options: ['Free', 'Uniform', 'Distort', 'Perspective', 'Warp']
    },
    {
      kind: 'choice',
      key: 'interpolation',
      label: 'Interpolation',
      short: 'Int',
      options: ['Bicubic', 'Bilinear', 'Nearest']
    }
  ],
  fill: [
    percent('tolerance', 'Tolerance', 'Tol'),
    {
      kind: 'number',
      key: 'gap',
      label: 'Gap closing',
      short: 'Gap',
      min: 0,
      max: 20,
      unit: 'px',
      presets: [0, 1, 2, 3, 4, 6, 8, 12, 16, 20]
    },
    {
      kind: 'number',
      key: 'expand',
      label: 'Expand',
      short: 'Exp',
      min: -10,
      max: 10,
      unit: 'px',
      presets: [-10, -5, -3, -2, -1, 0, 1, 2, 3, 5, 10]
    },
    { kind: 'choice', key: 'reference', label: 'Reference', short: 'Ref', options: ['All layers', 'Current layer'] }
  ],
  gradient: [
    { kind: 'choice', key: 'shape', label: 'Shape', short: 'Sh', options: ['Linear', 'Radial', 'Reflected', 'Angle'] },
    percent('opacity', 'Opacity', 'Op'),
    { kind: 'toggle', key: 'dither', label: 'Dither', short: 'Di' }
  ]
};

/** The starting value of every setting of every tool. */
export const defaultValues: Record<ToolId, Readonly<Record<string, SettingValue>>> = {
  brush: {
    size: 12,
    opacity: 100,
    flow: 80,
    hardness: 85,
    smoothing: 20,
    spacing: 8,
    pressureSize: true,
    pressureOpacity: false,
    angle: 0,
    roundness: 100
  },
  mixer: { size: 40, opacity: 85, wet: 50, load: 60, hardness: 40, smoothing: 30, pressureSize: true },
  eraser: { size: 30, opacity: 100, hardness: 70, smoothing: 10, pressureSize: false },
  picker: { sample: 'All layers', area: 'Point' },
  lasso: { mode: 'New', feather: 0, antialias: true },
  transform: { mode: 'Free', interpolation: 'Bicubic' },
  fill: { tolerance: 20, gap: 2, expand: 1, reference: 'All layers' },
  gradient: { shape: 'Linear', opacity: 100, dither: true }
};

/** A brush preset: the painting tool it belongs to and the settings it sets. */
export type Preset = {
  id: string;
  name: string;
  tool: 'brush' | 'mixer' | 'eraser';
  /** A group, as brush libraries sort presets into sets. */
  set: 'Inking' | 'Painting' | 'Soft' | 'Erase';
  values: Readonly<Record<string, SettingValue>>;
};

export const presets: readonly Preset[] = [
  {
    id: 'g-pen',
    name: 'G-pen',
    tool: 'brush',
    set: 'Inking',
    values: { size: 6, opacity: 100, hardness: 100, smoothing: 45, pressureSize: true }
  },
  {
    id: 'fineliner',
    name: 'Fineliner',
    tool: 'brush',
    set: 'Inking',
    values: { size: 3, opacity: 100, hardness: 100, smoothing: 30, pressureSize: false }
  },
  {
    id: 'pencil',
    name: 'Pencil',
    tool: 'brush',
    set: 'Inking',
    values: { size: 4, opacity: 55, hardness: 70, smoothing: 10, pressureSize: true }
  },
  {
    id: 'marker',
    name: 'Marker',
    tool: 'brush',
    set: 'Painting',
    values: { size: 24, opacity: 70, hardness: 95, smoothing: 15, pressureSize: false }
  },
  {
    id: 'gouache',
    name: 'Dry gouache',
    tool: 'brush',
    set: 'Painting',
    values: { size: 40, opacity: 95, hardness: 80, smoothing: 20, pressureSize: true }
  },
  {
    id: 'flat',
    name: 'Flat round',
    tool: 'brush',
    set: 'Painting',
    values: { size: 70, opacity: 100, hardness: 90, smoothing: 10, pressureSize: false }
  },
  {
    id: 'blender',
    name: 'Soft blender',
    tool: 'mixer',
    set: 'Painting',
    values: { size: 60, opacity: 70, hardness: 30, wet: 70, smoothing: 30 }
  },
  {
    id: 'smudge',
    name: 'Smudge',
    tool: 'mixer',
    set: 'Painting',
    values: { size: 30, opacity: 90, hardness: 60, wet: 40, smoothing: 20 }
  },
  {
    id: 'airbrush',
    name: 'Airbrush',
    tool: 'brush',
    set: 'Soft',
    values: { size: 140, opacity: 35, hardness: 0, smoothing: 10, pressureSize: false }
  },
  {
    id: 'soft-round',
    name: 'Soft round',
    tool: 'brush',
    set: 'Soft',
    values: { size: 60, opacity: 60, hardness: 25, smoothing: 10, pressureSize: true }
  },
  {
    id: 'hard-eraser',
    name: 'Hard eraser',
    tool: 'eraser',
    set: 'Erase',
    values: { size: 24, opacity: 100, hardness: 100 }
  },
  {
    id: 'soft-eraser',
    name: 'Soft eraser',
    tool: 'eraser',
    set: 'Erase',
    values: { size: 90, opacity: 60, hardness: 10 }
  }
];

/** A painter's starting palette: neutrals, then muted and saturated hues. */
export const palette = [
  '#111111',
  '#3a3a3a',
  '#6b6b6b',
  '#9e9e9e',
  '#d0d0d0',
  '#ffffff',
  '#262329',
  '#5a3a22',
  '#a7795a',
  '#d9c4a5',
  '#efeae1',
  '#b9c2b4',
  '#c4463a',
  '#e0703a',
  '#e6b93d',
  '#7aa05a',
  '#3d8a7a',
  '#3d6a8c',
  '#5a4e9a',
  '#9a4e8a',
  '#e88aa0',
  '#f2d06b',
  '#9fd3c7',
  '#8fb3e0'
] as const;
