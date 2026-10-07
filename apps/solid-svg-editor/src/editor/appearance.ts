import type { ThemePreset } from './types';

/** GodSVG's SVG text colors, one per highlighted token kind. */
export type HighlighterColors = {
  readonly symbol: string;
  readonly element: string;
  readonly attribute: string;
  readonly string: string;
  readonly comment: string;
  readonly text: string;
  readonly entity: string;
  readonly cdata: string;
  readonly error: string;
};

export type HighlighterPreset = 'default-dark' | 'default-light';

/** GodSVG's highlighter presets (`SaveData.get_setting_default`). */
export const highlighterPresets = {
  'default-dark': {
    symbol: '#abc9ff',
    element: '#ff8ccc',
    attribute: '#bce0ff',
    string: '#a1ffe0',
    comment: '#d4d6d980',
    text: '#ffffb3cc',
    entity: '#f2ba91dd',
    cdata: '#bfac73dd',
    error: '#ff5555'
  },
  'default-light': {
    symbol: '#23488c',
    element: '#8c004b',
    attribute: '#003666',
    string: '#006644',
    comment: '#3e3e4080',
    text: '#999917cc',
    entity: '#99480fdd',
    cdata: '#735600dd',
    error: '#cc0000'
  }
} as const satisfies Record<HighlighterPreset, HighlighterColors>;

/** GodSVG's handle look: a size factor, the fill, and the outline per interaction state (also used for contours). */
export type HandleSettings = {
  readonly size: number;
  readonly inside: string;
  readonly normal: string;
  readonly hovered: string;
  readonly selected: string;
  readonly hoveredSelected: string;
};

/** GodSVG's marching-ants rectangle around selected elements: ants per second, stroke width, dash, and two colors. */
export type SelectionRectangleSettings = {
  readonly speed: number;
  readonly width: number;
  readonly dashLength: number;
  readonly color1: string;
  readonly color2: string;
};

/** GodSVG's basic colors: valid input, errors, and warnings across the interface. */
export type BasicColors = { readonly valid: string; readonly error: string; readonly warning: string };

/** The appearance settings GodSVG resets when the theme preset changes. */
export function themeDependentDefaults(theme: ThemePreset): {
  readonly highlighterPreset: HighlighterPreset;
  readonly highlighter: HighlighterColors;
  readonly handles: HandleSettings;
  readonly basicColors: BasicColors;
} {
  const light = theme === 'light';
  const highlighterPreset: HighlighterPreset = light ? 'default-light' : 'default-dark';

  return {
    highlighterPreset,
    highlighter: highlighterPresets[highlighterPreset],
    handles: {
      size: 1,
      inside: '#ffffff',
      normal: '#111111',
      hovered: light ? '#808080' : '#aaaaaa',
      selected: '#4466ff',
      hoveredSelected: '#ff4444'
    },
    basicColors: light
      ? { valid: '#22bb22', error: '#bb2222', warning: '#bb9922' }
      : { valid: '#99ff99', error: '#ff9999', warning: '#ffdd55' }
  };
}

export const defaultSelectionRectangle: SelectionRectangleSettings = {
  speed: 30,
  width: 2,
  dashLength: 10,
  color1: '#ffffffcc',
  color2: '#000000cc'
};

/** Hex colors with an optional alpha: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
}
