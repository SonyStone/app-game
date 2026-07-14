import { compactFormatter, prettyFormatter } from '../formatter';
import { createId } from '../svg-model';

import type { AppSettings, EditorTab } from './types';
import { createEmptySvgDocument, serializeSvgDocument, type SvgDocumentFactoryCapabilityIndex } from './svg-document';

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
    useCtrlForZoom: false,
    rasterPreviewDuringInteraction: false,
    dragSelectionMode: 'contain',
    disabledExtensionPackageIds: [],
    appliedExtensionPackageMigrationKeys: [],
    appliedExtensionPackageUpdateKeys: []
  };
}

export function createInitialTab(capabilities?: SvgDocumentFactoryCapabilityIndex): EditorTab {
  const document = createEmptySvgDocument(capabilities);
  return {
    id: createId(),
    name: 'Untitled.svg',
    document,
    code: serializeSvgDocument(document, prettyFormatter),
    dirty: false,
    parseError: undefined
  };
}
