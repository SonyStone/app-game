import { writeClipboard } from '@solid-primitives/clipboard';
import { createSignal, type Accessor } from 'solid-js';

import type { CommandService, DocumentService, ResourceService } from '../../editor/kernel';
import type { EditorCommandEvent } from '../../editor/commands';
import type { SvgDocumentFactoryCapabilityIndex } from '../../editor/svg-document';
import type { FormatterSettings } from '../../formatter';
import { findNode } from '../../svg-model';
import { downloadBlob } from '../../editor/export-utils';
import { createEditorDocuments } from '../documents/createEditorDocuments';

export interface CreateEditorDocumentServicesOptions {
  readonly formatter: Accessor<FormatterSettings>;
  readonly capabilities: SvgDocumentFactoryCapabilityIndex;
  readonly onSelectionReset: () => void;
  readonly onDocumentOpened: () => void;
  readonly onParseError: () => void;
}

export interface CreateDocumentServiceOptions {
  readonly exportText: Accessor<string>;
  readonly elementCount: Accessor<number>;
}

export interface EditorDocumentUiActions {
  readonly downloadSvg: () => void;
  readonly copySvgText: () => Promise<void>;
}

export interface EditorDocumentServices {
  readonly documents: ReturnType<typeof createEditorDocuments>;
  readonly commands: CommandService;
  readonly resources: ResourceService;
  readonly createDocumentService: (options: CreateDocumentServiceOptions) => DocumentService;
  readonly createUiActions: (options: { readonly exportText: Accessor<string> }) => EditorDocumentUiActions;
}

export function createEditorDocumentServices(options: CreateEditorDocumentServicesOptions): EditorDocumentServices {
  const [recentCommandEvent, setRecentCommandEvent] = createSignal<EditorCommandEvent>();
  const documents = createEditorDocuments({
    capabilities: options.capabilities,
    formatter: options.formatter,
    onSelectionReset: options.onSelectionReset,
    onDocumentOpened: options.onDocumentOpened,
    onParseError: options.onParseError
  });

  documents.commandEvents.listen((event) => setRecentCommandEvent(event));

  const commands = {
    canUndo: documents.canUndo,
    canRedo: documents.canRedo,
    recentEvent: recentCommandEvent,
    events: documents.commandEvents,
    dispatch: documents.dispatchCommand,
    beginTransaction: documents.beginCommandTransaction,
    updateTransaction: documents.updateCommandTransaction,
    commitTransaction: documents.commitCommandTransaction,
    cancelTransaction: documents.cancelCommandTransaction,
    undo: documents.undo,
    redo: documents.redo
  } satisfies CommandService;
  const resources = {
    activeResources: () => documents.activeDocument().resources,
    activeResourceGraph: () => documents.activeDocument().resourceGraph,
    resolveNode: (nodeId: string) => findNode(documents.activeRoot(), nodeId)
  } satisfies ResourceService;

  function createDocumentService(documentOptions: CreateDocumentServiceOptions): DocumentService {
    return {
      tabs: documents.tabs,
      activeTabId: documents.activeTabId,
      setActiveTabId: documents.setActiveTabId,
      activeTab: documents.activeTab,
      activeDocument: documents.activeDocument,
      activeRoot: documents.activeRoot,
      activeSpatialIndex: documents.activeSpatialIndex,
      activeCode: documents.activeCode,
      exportText: documentOptions.exportText,
      elementCount: documentOptions.elementCount,
      applyCode: documents.applyCode,
      reformatActiveCode: documents.reformatActiveCode,
      createNewTab: documents.createNewTab,
      closeTab: documents.closeTab,
      importSvgText: documents.importSvgText,
      markActiveTabClean: documents.markActiveTabClean
    } satisfies DocumentService;
  }

  function createUiActions(actionOptions: { readonly exportText: Accessor<string> }): EditorDocumentUiActions {
    function downloadSvg(): void {
      downloadBlob(actionOptions.exportText(), documents.activeTab()?.name ?? 'image.svg', 'image/svg+xml');
      documents.markActiveTabClean();
    }

    async function copySvgText(): Promise<void> {
      await writeClipboard(actionOptions.exportText());
    }

    return { downloadSvg, copySvgText } satisfies EditorDocumentUiActions;
  }

  return {
    documents,
    commands,
    resources,
    createDocumentService,
    createUiActions
  } satisfies EditorDocumentServices;
}
