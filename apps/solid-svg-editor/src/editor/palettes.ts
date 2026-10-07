import { colorToHex } from './colors';

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

/** A palette as GodSVG's XML: `<palette title="…">` with one `<color value="…" name="…"/>` per color. */
export function paletteToXml(palette: ColorPalette): string {
  const colors = palette.colors.map(
    (color) => `\t<color value="${escapeXml(color.value)}"${color.name ? ` name="${escapeXml(color.name)}"` : ''}/>\n`
  );
  return `<palette title="${escapeXml(palette.title)}">\n${colors.join('')}</palette>`;
}

/** Reads every `<palette>` in GodSVG's palette XML; colors that aren't valid are skipped, like GodSVG. */
export function palettesFromXml(text: string): readonly ColorPalette[] {
  const document = new DOMParser().parseFromString(`<palettes>${text.replace(/<\?xml[^>]*\?>/, '')}</palettes>`, 'application/xml');

  if (document.querySelector('parsererror')) {
    return [];
  }

  return Array.from(document.getElementsByTagName('palette')).map((palette) => ({
    title: (palette.getAttribute('title') ?? '').trim(),
    colors: Array.from(palette.getElementsByTagName('color')).flatMap((color) => {
      const value = (color.getAttribute('value') ?? '').trim();
      return colorToHex(value) ? [{ value, name: (color.getAttribute('name') ?? '').trim() }] : [];
    })
  }));
}

/** Whether text starts with a `<palette>` element (comments and whitespace aside), as GodSVG checks pasted text. */
export function isPaletteXml(text: string): boolean {
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<palette[\s>]/.test(text);
}

/** GodSVG's palette warnings: no title, a title used by another palette, or a color defined twice with one name. */
export function paletteWarnings(palette: ColorPalette, palettes: readonly ColorPalette[]): readonly string[] {
  const warnings: string[] = [];

  if (palette.title === '') {
    warnings.push("Unnamed palettes won't be shown.");
  } else if (palettes.filter((item) => item.title === palette.title).length > 1) {
    warnings.push("Multiple palettes can't have the same name.");
  }

  const definitions = palette.colors.map((color) => `${colorToHex(color.value) ?? color.value}\u0000${color.name}`);

  if (new Set(definitions).size !== definitions.length) {
    warnings.push('This palette has identically defined colors.');
  }

  return warnings;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
