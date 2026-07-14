import { useKeyDownList } from '@solid-primitives/keyboard';
import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

import { defaultSettings } from '../../editor/defaults';
import {
  mergeExtensionPackageIds,
  mergeExtensionPackageMigrationKeys,
  mergeExtensionPackageUpdateKeys
} from '../../editor/extension-packages';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { createSvgNodeRendererFromContributions } from '../viewport/svg-renderer';
import { createAppHostServices } from './createAppHostServices';
import { createEditorDocumentServices } from './createEditorDocumentServices';
import { createEditorFileHostServices } from './createEditorFileHostServices';
import { createEditorOverlayServices } from './createEditorOverlayServices';
import { createEditorSelectionServices } from './createEditorSelectionServices';
import { createEditorShortcutRuntime } from './createEditorShortcutRuntime';
import { createEditorViewportServices } from './createEditorViewportServices';
import { createEditorWorkbenchServices } from './createEditorWorkbenchServices';
import {
  createEditorAppRegistries,
  createEditorAppSvgCapabilities,
  type EditorAppContributionInstallOptions
} from './editorAppContributions';
import { createEditorKernel } from './createEditorKernel';

export interface CreateEditorAppControllerOptions extends EditorAppContributionInstallOptions {}

export function createEditorAppController(options: CreateEditorAppControllerOptions = {}) {
  const [settings, setSettings] = makePersisted(createSignal(defaultSettings()), {
    name: 'solid-svg-editor-settings-v1'
  });
  const appInstallOptions = {
    ...options,
    disabledPackageIds: mergeExtensionPackageIds(options.disabledPackageIds ?? [], settings().disabledExtensionPackageIds ?? []),
    appliedMigrationKeys: mergeExtensionPackageMigrationKeys(
      options.appliedMigrationKeys ?? [],
      settings().appliedExtensionPackageMigrationKeys ?? []
    ),
    appliedUpdateKeys: mergeExtensionPackageUpdateKeys(
      options.appliedUpdateKeys ?? [],
      settings().appliedExtensionPackageUpdateKeys ?? []
    )
  } satisfies EditorAppContributionInstallOptions;
  const appRegistries = createEditorAppRegistries(appInstallOptions);
  const appSvgCapabilities = createEditorAppSvgCapabilities(appInstallOptions);
  const appSvgNodeRenderer = createSvgNodeRendererFromContributions(appRegistries.renderers);
  const workbenchServices = createEditorWorkbenchServices();
  const heldKeys = useKeyDownList();

  let resetDocumentSelection: () => void = () => undefined;
  let centerOpenedDocument: () => void = () => undefined;
  const documentServices = createEditorDocumentServices({
    capabilities: appSvgCapabilities,
    formatter: () => settings().formatter,
    onSelectionReset: () => resetDocumentSelection(),
    onDocumentOpened: () => centerOpenedDocument(),
    onParseError: workbenchServices.showCodePanel
  });
  const { documents } = documentServices;

  const fileHost = createEditorFileHostServices({ importSvgText: documents.importSvgText });
  const { appHost, fullscreen } = createAppHostServices({ settings, dropActive: fileHost.svgImport.dropActive });

  const selectionServices = createEditorSelectionServices({
    activeRoot: documents.activeRoot,
    dispatchCommand: documents.dispatchCommand
  });
  const overlayServices = createEditorOverlayServices({ selectTarget: selectionServices.selection.selectTarget });
  resetDocumentSelection = selectionServices.resetDocumentSelection;

  const viewportServices = createEditorViewportServices({
    settings,
    activeRoot: documents.activeRoot,
    activeSpatialIndex: documents.activeSpatialIndex,
    selectedIds: selectionServices.selection.selectedIds,
    selectedTargets: selectionServices.selection.selectedTargets,
    selectedPathAnchor: selectionServices.selection.selectedPathAnchor,
    setSelectedTargets: selectionServices.selection.setSelectedTargets,
    selectTarget: selectionServices.selection.selectTarget,
    selectNode: selectionServices.selection.selectNode,
    clearSelection: selectionServices.selection.clearSelection,
    setContextMenu: overlayServices.setContextMenu,
    openContextMenu: overlayServices.contextMenu.open,
    beginCommandTransaction: documents.beginCommandTransaction,
    cancelCommandTransaction: documents.cancelCommandTransaction,
    dragSelectionMode: () => settings().dragSelectionMode,
    useCtrlForZoom: () => settings().useCtrlForZoom,
    referenceImage: fileHost.referenceImage.image,
    showReference: fileHost.referenceImage.show,
    overlayReference: fileHost.referenceImage.overlay,
    capabilities: appSvgCapabilities,
    renderers: appRegistries.renderers,
    toolContributions: appRegistries.tools,
    nodeRenderer: appSvgNodeRenderer
  });
  const { exportText, elementCount } = viewportServices;
  centerOpenedDocument = viewportServices.viewport.centerFrame;
  const documentActions = documentServices.createUiActions({ exportText });

  const kernel = createEditorKernel<EditorPanelContext>({
    documents: documentServices.createDocumentService({ exportText, elementCount }),
    selection: selectionServices.selection,
    commands: documentServices.commands,
    settings: {
      settings,
      setSettings
    },
    viewport: viewportServices.viewport,
    resources: documentServices.resources,
    capabilities: {
      svg: appSvgCapabilities
    },
    rendering: {
      svgNodeRenderer: appSvgNodeRenderer,
      viewportRenderer: viewportServices.viewportRenderer
    },
    input: {
      heldKeys,
      viewportPointer: viewportServices.viewportPointer
    },
    ui: {
      appHost,
      contextMenu: overlayServices.contextMenu,
      svgImport: fileHost.svgImport,
      downloadSvg: documentActions.downloadSvg,
      copySvgText: documentActions.copySvgText,
      modal: overlayServices.modal,
      workbench: workbenchServices.workbench,
      fullscreen,
      referenceImage: fileHost.referenceImage
    },
    registries: appRegistries
  });
  createEditorShortcutRuntime({
    kernel,
    handlers: selectionServices.shortcutHandlers
  });

  return {
    kernel
  };
}

export type EditorAppController = ReturnType<typeof createEditorAppController>;
