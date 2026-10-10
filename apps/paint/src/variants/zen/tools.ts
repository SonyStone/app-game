import type { Brush } from '@app-game/paint-core/brush';

/** The drawing tool a fan slot looks like. */
export type ToolShape = 'pencil' | 'pen' | 'marker' | 'brush' | 'airbrush';

/**
 * One of the fan's five brushes: the shape it shows, the library preset it paints with and the settings applied over
 * the preset. The default slots are tunings of the built-in round brush; a long press puts another preset, such as an
 * imported ABR brush, in a slot. Size and opacity changed on the pebble are kept in the slot's settings.
 */
export type ToolSlot = {
  shape: ToolShape;
  preset: string;
  settings: Partial<Brush>;
  /** The user put `preset` in the slot, rather than the slot's default tool. */
  chosen?: boolean;
};

/** The built-in round brush, which the default slots tune. */
export const roundPreset = 'builtin:soft-round';

/** The fan's brushes on a fresh device, after Paper's and Sketches' tool trays. */
export const defaultSlots: readonly ToolSlot[] = [
  {
    shape: 'pencil',
    preset: roundPreset,
    settings: { size: 4, hardness: 0.85, flow: 0.55, opacity: 1, spacing: 0.08, pressureSize: true, pressureFlow: true }
  },
  {
    shape: 'pen',
    preset: roundPreset,
    settings: { size: 7, hardness: 1, flow: 1, opacity: 1, spacing: 0.06, pressureSize: true, pressureFlow: false }
  },
  {
    shape: 'marker',
    preset: roundPreset,
    settings: {
      size: 22,
      hardness: 0.9,
      flow: 1,
      opacity: 0.55,
      spacing: 0.05,
      pressureSize: false,
      pressureFlow: false
    }
  },
  {
    shape: 'brush',
    preset: roundPreset,
    settings: {
      size: 32,
      hardness: 0.65,
      flow: 0.35,
      opacity: 1,
      spacing: 0.12,
      pressureSize: true,
      pressureFlow: false
    }
  },
  {
    shape: 'airbrush',
    preset: roundPreset,
    settings: { size: 140, hardness: 0, flow: 0.06, opacity: 1, spacing: 0.1, pressureSize: false, pressureFlow: true }
  }
];

/** Names of the tool shapes, for labels. */
export const shapeNames: Record<ToolShape, string> = {
  pencil: 'Pencil',
  pen: 'Ink pen',
  marker: 'Marker',
  brush: 'Brush',
  airbrush: 'Airbrush'
};

/** Colors offered beside the recent ones until there are enough of those: inks and greys. */
export const starterColors: readonly string[] = ['#1d1d1f', '#5b5b60', '#a1a1a6', '#ffffff', '#8c2f2b', '#b8862b'];

/**
 * The fan's colors: the current one first, then the recent ones, then starter colors, without repeats, `count` in
 * all.
 */
export function fanColors(current: string, recent: readonly string[], count: number): string[] {
  const unique = [...new Set([current, ...recent, ...starterColors].map((color) => color.toLowerCase()))];
  return unique.slice(0, count);
}
