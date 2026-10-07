/** A titled list of named colors shown in the color picker, like GodSVG's palettes. */
export type ColorPalette = {
  readonly title: string;
  readonly colors: readonly { readonly value: string; readonly name: string }[];
};

/** GodSVG's palette presets. */
export const palettePresets = {
  empty: { title: 'New palette', colors: [] },
  pure: {
    title: 'Pure',
    colors: [
      { value: '#fff', name: 'White' },
      { value: '#000', name: 'Black' },
      { value: '#f00', name: 'Red' },
      { value: '#0f0', name: 'Green' },
      { value: '#00f', name: 'Blue' },
      { value: '#ff0', name: 'Yellow' },
      { value: '#f0f', name: 'Magenta' },
      { value: '#0ff', name: 'Cyan' }
    ]
  },
  grayscale: {
    title: 'Grayscale',
    colors: [
      { value: '#000', name: 'Black' },
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((step) => {
        const channel = Math.round((step / 10) * 255)
          .toString(16)
          .padStart(2, '0');
        return { value: `#${channel}${channel}${channel}`, name: `${step * 10}% Gray` };
      }),
      { value: '#fff', name: 'White' }
    ]
  }
} as const satisfies Record<string, ColorPalette>;

/** The palettes a new installation starts with: GodSVG's "Pure" preset. */
export function defaultPalettes(): readonly ColorPalette[] {
  return [palettePresets.pure];
}

/**
 * Reads saved palettes. Earlier versions stored a flat list of colors, which becomes one palette; anything unreadable
 * gives the default palettes.
 */
export function restorePalettes(stored: unknown): readonly ColorPalette[] {
  if (!Array.isArray(stored)) {
    return defaultPalettes();
  }

  if (stored.every((item) => typeof item === 'string')) {
    return [{ title: 'Palette', colors: stored.map((value: string) => ({ value, name: value })) }];
  }

  return stored.every(isColorPalette) ? stored : defaultPalettes();
}

function isColorPalette(value: unknown): value is ColorPalette {
  return (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    typeof value.title === 'string' &&
    'colors' in value &&
    Array.isArray(value.colors) &&
    value.colors.every(
      (color: unknown) =>
        typeof color === 'object' &&
        color !== null &&
        'value' in color &&
        typeof color.value === 'string' &&
        'name' in color &&
        typeof color.name === 'string'
    )
  );
}
