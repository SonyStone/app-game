import { compactFormatter, formatterPreset, prettyFormatter, type FormatterSettings } from '../formatter';
import { createId } from '../svg-model';
import { resolveLocale, sourceLocale } from '../i18n/locales';
import { defaultPalettes, restorePalettes } from './palettes';

import type { AppSettings, EditorTab } from './types';
import { createEmptySvgDocument, serializeSvgDocument } from './svg-document';

/** GodSVG's default icon preview sizes. */
export const defaultPreviewSizes: readonly number[] = [16, 24, 32, 48, 64];

export function defaultSettings(): AppSettings {
  return {
    language: sourceLocale,
    themePreset: 'dark',
    baseColor: '#10121d',
    accentColor: '#6699ff',
    canvasColor: '#1f2233',
    gridColor: '#808080',
    showGrid: true,
    showHandles: true,
    viewRasterized: false,
    snapEnabled: false,
    snapSize: 1,
    formatter: prettyFormatter,
    exportFormatter: compactFormatter,
    optimizer: {
      removeComments: true,
      convertShapes: true,
      simplifyPathParameters: true
    },
    palettes: defaultPalettes(),
    previewSizes: defaultPreviewSizes,
    shortcutOverrides: {},
    tabMiddleClickClose: true,
    useCtrlForZoom: false,
    rasterPreviewDuringInteraction: false,
    dragSelectionMode: 'contain'
  };
}

/**
 * Reads settings saved by an earlier version, filling fields added since: formatter fields come from the saved
 * formatter's preset, everything else from `defaultSettings`. Unreadable data gives the defaults.
 */
export function restoreSettings(data: string): AppSettings {
  const defaults = defaultSettings();
  let stored: Partial<AppSettings>;

  try {
    stored = JSON.parse(data) as Partial<AppSettings>;
  } catch {
    return defaults;
  }

  return {
    ...defaults,
    ...stored,
    formatter: restoreFormatter(stored.formatter, defaults.formatter),
    exportFormatter: restoreFormatter(stored.exportFormatter, defaults.exportFormatter),
    optimizer: { ...defaults.optimizer, ...stored.optimizer },
    palettes: restorePalettes(stored.palettes),
    previewSizes:
      Array.isArray(stored.previewSizes) && stored.previewSizes.every((size) => Number.isInteger(size) && size > 0)
        ? stored.previewSizes
        : defaults.previewSizes,
    shortcutOverrides: isShortcutOverrides(stored.shortcutOverrides) ? stored.shortcutOverrides : {},
    language: resolveLocale(stored.language)
  };
}

function isShortcutOverrides(value: unknown): value is AppSettings['shortcutOverrides'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (bindings: unknown) =>
        Array.isArray(bindings) &&
        bindings.every((binding: unknown) => typeof binding === 'object' && binding !== null && 'key' in binding && typeof binding.key === 'string')
    )
  );
}

function restoreFormatter(stored: Partial<FormatterSettings> | undefined, fallback: FormatterSettings): FormatterSettings {
  return stored ? { ...formatterPreset(stored.preset === 'compact' ? 'compact' : 'pretty'), ...stored } : fallback;
}

export function createInitialTab(): EditorTab {
  const document = createEmptySvgDocument();
  return {
    id: createId(),
    name: 'Untitled.svg',
    document,
    code: serializeSvgDocument(document, prettyFormatter),
    dirty: false,
    parseError: undefined
  };
}
