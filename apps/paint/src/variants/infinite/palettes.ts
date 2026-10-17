/**
 * The color panel's collection of swatch palettes, after the ones Infinite Painter 7.1 starts with: its Basic Palette
 * (reds and pinks, purples, blues and greens, yellows and oranges, then white, gray and black) and two of its others.
 * Colors are lowercase `#rrggbb`.
 */
export const infinitePalettes: readonly InfinitePalette[] = [
  {
    name: 'Basic Palette',
    colors: [
      '#74333b',
      '#a53531',
      '#b9385e',
      '#e473a1',
      '#a1257b',
      '#7b2c7d',
      '#4c2f67',
      '#2d3854',
      '#2e5181',
      '#007097',
      '#249bc1',
      '#006753',
      '#257951',
      '#1c8b45',
      '#24a84d',
      '#8fc23f',
      '#f2eb52',
      '#f9c13f',
      '#c69d4a',
      '#e46843',
      '#ffffff',
      '#8b9094',
      '#1d1c1a'
    ]
  },
  {
    name: 'Warm + Cool Ink',
    colors: [
      '#f9f7ea',
      '#f2f0e3',
      '#eae4d6',
      '#ccc5b3',
      '#b6ad9c',
      '#5f5a52',
      '#46423d',
      '#2e2b28',
      '#2b2f33',
      '#3d444a',
      '#1f3d4a',
      '#204d5c',
      '#173a33',
      '#1d4a33',
      '#1e5a35'
    ]
  },
  {
    name: 'Foliage',
    colors: [
      '#4f5a22',
      '#6a6129',
      '#6e5524',
      '#6a4a2a',
      '#6a3526',
      '#3c4a1c',
      '#56692a',
      '#7d8f3a',
      '#a3ad5c',
      '#c9c98a',
      '#4a3530',
      '#5f5f5f',
      '#404448',
      '#2c3524',
      '#1b2418'
    ]
  }
];

/** A named list of swatches. */
export type InfinitePalette = { name: string; colors: readonly string[] };
