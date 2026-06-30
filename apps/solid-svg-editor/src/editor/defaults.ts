import { compactFormatter, prettyFormatter, serializeRoot } from '../formatter';
import { createDefaultRoot, createId } from '../svg-model';

import type { AppSettings, EditorTab, ShortcutItem } from './types';

export const shortcutItems = [
  { category: 'file', action: 'Import', keys: 'Ctrl+O' },
  { category: 'file', action: 'Export', keys: 'Ctrl+E' },
  { category: 'file', action: 'Save SVG', keys: 'Ctrl+S' },
  { category: 'file', action: 'New tab', keys: 'Ctrl+N' },
  { category: 'file', action: 'Optimize', keys: 'Ctrl+Shift+O' },
  { category: 'edit', action: 'Undo', keys: 'Ctrl+Z' },
  { category: 'edit', action: 'Redo', keys: 'Ctrl+Shift+Z' },
  { category: 'edit', action: 'Copy SVG text', keys: 'Ctrl+Shift+C' },
  { category: 'edit', action: 'Duplicate', keys: 'Ctrl+D' },
  { category: 'edit', action: 'Delete', keys: 'Delete' },
  { category: 'edit', action: 'Move up', keys: 'Alt+ArrowUp' },
  { category: 'edit', action: 'Move down', keys: 'Alt+ArrowDown' },
  { category: 'edit', action: 'Select all', keys: 'Ctrl+A' },
  { category: 'view', action: 'Zoom in', keys: 'Ctrl+=' },
  { category: 'view', action: 'Zoom out', keys: 'Ctrl+-' },
  { category: 'view', action: 'Reset zoom', keys: 'Ctrl+0' },
  { category: 'view', action: 'Toggle grid', keys: 'Ctrl+G' },
  { category: 'view', action: 'Toggle handles', keys: 'Ctrl+H' },
  { category: 'tool', action: 'Insert path command', keys: 'M L H V Z A Q T C S' },
  { category: 'help', action: 'Settings', keys: 'Ctrl+,' }
] as const satisfies readonly ShortcutItem[];

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
    palettes: ['#000000', '#ffffff', '#ff6666', '#66cc88', '#6699ff', '#f6c85f'],
    tabMiddleClickClose: true,
    useCtrlForZoom: true,
    rasterPreviewDuringInteraction: false
  };
}

export function createInitialTab(): EditorTab {
  const root = createDefaultRoot();
  return {
    id: createId(),
    name: 'Untitled.svg',
    root,
    code: serializeRoot(root, prettyFormatter),
    dirty: false,
    parseError: undefined
  };
}
