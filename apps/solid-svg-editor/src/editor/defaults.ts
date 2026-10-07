import { compactFormatter, formatterPreset, prettyFormatter, type FormatterSettings } from '../formatter';
import { createId } from '../svg-model';
import { defaultPanelLayout, restorePanelLayout } from '../features/layout/panel-layout';
import { defaultSelectionRectangle, isHexColor, themeDependentDefaults } from './appearance';
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
    shortcutPanel: defaultShortcutPanel(),
    panelLayout: defaultPanelLayout(),
    ...themeDependentDefaults('dark'),
    selectionRectangle: defaultSelectionRectangle,
    gridTickInterval: 4,
    fonts: {},
    invertZoom: false,
    panWithLmb: false,
    panningSpeed: 20,
    uiScale: 'auto',
    keepScreenOn: false,
    pathCommandInsertRelative: false,
    pathCommandInsertKeepOpen: false,
    tabMiddleClickClose: true,
    useFilenameForWindowTitle: true,
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
    language: resolveLocale(stored.language),
    shortcutPanel: restoreShortcutPanel(stored.shortcutPanel),
    panelLayout: restorePanelLayout(stored.panelLayout),
    ...restoreAppearance(stored, defaults)
  };
}

/**
 * Restores the appearance and input settings added with GodSVG's settings menu: colors must be hex, numbers within
 * GodSVG's ranges; anything else falls back to the defaults (theme-dependent ones follow the stored theme).
 */
function restoreAppearance(stored: Partial<AppSettings>, defaults: AppSettings) {
  const themed = themeDependentDefaults(stored.themePreset ?? defaults.themePreset);
  const colors = <T extends Record<string, string>>(value: unknown, fallback: T): T =>
    Object.fromEntries(
      Object.entries(fallback).map(([key, color]) => {
        const candidate = (value as Record<string, unknown> | undefined)?.[key];
        return [key, isHexColor(candidate) ? candidate : color];
      })
    ) as T;
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  const handles = stored.handles as Partial<AppSettings['handles']> | undefined;
  const { inside, normal, hovered, selected, hoveredSelected } = themed.handles;
  const rectangle = stored.selectionRectangle as Partial<AppSettings['selectionRectangle']> | undefined;
  const fonts = stored.fonts && typeof stored.fonts === 'object' ? stored.fonts : {};

  return {
    highlighterPreset: stored.highlighterPreset === 'default-light' || stored.highlighterPreset === 'default-dark' ? stored.highlighterPreset : themed.highlighterPreset,
    highlighter: colors(stored.highlighter, themed.highlighter),
    handles: { ...colors(handles, { inside, normal, hovered, selected, hoveredSelected }), size: number(handles?.size, 1, 0.5, 4) },
    selectionRectangle: {
      ...colors(rectangle, { color1: defaultSelectionRectangle.color1, color2: defaultSelectionRectangle.color2 }),
      speed: number(rectangle?.speed, defaultSelectionRectangle.speed, 0, 500),
      width: number(rectangle?.width, defaultSelectionRectangle.width, 1, 8),
      dashLength: number(rectangle?.dashLength, defaultSelectionRectangle.dashLength, 1, 100)
    },
    gridTickInterval: number(stored.gridTickInterval, defaults.gridTickInterval, 0, 16),
    basicColors: colors(stored.basicColors, themed.basicColors),
    fonts: Object.fromEntries(Object.entries(fonts).filter(([key, name]) => ['main', 'bold', 'mono'].includes(key) && typeof name === 'string')),
    panningSpeed: number(stored.panningSpeed, defaults.panningSpeed, 1, 200),
    uiScale: typeof stored.uiScale === 'number' ? number(stored.uiScale, 1, 0.5, 4) : 'auto'
  } satisfies Partial<AppSettings>;
}

/** GodSVG's shortcut panel has six slots. */
export const shortcutPanelSlotCount = 6;

function defaultShortcutPanel(): AppSettings['shortcutPanel'] {
  const touch = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;
  return { visible: touch, layout: 'horizontal-strip', slots: ['edit.undo', 'edit.redo'] };
}

function restoreShortcutPanel(stored: Partial<AppSettings['shortcutPanel']> | undefined): AppSettings['shortcutPanel'] {
  const defaults = defaultShortcutPanel();
  const layouts: readonly string[] = ['horizontal-strip', 'horizontal-two-rows', 'vertical-strip'];

  return {
    visible: typeof stored?.visible === 'boolean' ? stored.visible : defaults.visible,
    layout: stored?.layout && layouts.includes(stored.layout) ? stored.layout : defaults.layout,
    slots: Array.isArray(stored?.slots)
      ? stored.slots.slice(0, shortcutPanelSlotCount).map((slot) => (typeof slot === 'string' ? slot : null))
      : defaults.slots
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
