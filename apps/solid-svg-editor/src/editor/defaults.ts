import { compactFormatter, formatterPreset, prettyFormatter, type FormatterSettings } from '../formatter';
import { createId } from '../svg-model';
import { defaultPalettes, restorePalettes } from './palettes';

import type { AppSettings, EditorTab } from './types';
import { createEmptySvgDocument, serializeSvgDocument } from './svg-document';

export function defaultSettings(): AppSettings {
  return {
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
    palettes: restorePalettes(stored.palettes)
  };
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
