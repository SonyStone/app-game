import { createEventBus } from '@solid-primitives/event-bus';
import { createMemo, createSignal, type Accessor } from 'solid-js';

import type { CommandTransaction, EditorCommand, EditorCommandEvent } from '../../editor/commands';
import { pushCommandHistory, type CommandHistoryPolicy } from '../../editor/commands';
import { svgCapabilities } from '../../editor/capabilities';
import { createInitialTab } from '../../editor/defaults';
import {
  cloneHistoryState,
  createHistoryEntry,
  restoreRedoRoot,
  restoreUndoRoot
} from '../../editor/history';
import { applyEditorOperations, isOperationBackedEditorCommand } from '../../editor/operations';
import {
  createEmptySvgDocument,
  createSvgDocument,
  parseSvgDocument,
  serializeSvgDocument,
  type SvgDocumentFactoryCapabilityIndex
} from '../../editor/svg-document';
import type { EditorTab, HistoryState } from '../../editor/types';
import { type FormatterSettings } from '../../formatter';
import { cloneRoot, createId, type SvgElementNode } from '../../svg-model';

interface ActiveCommandTransactionState {
  readonly tabId: string;
  readonly baseRoot: SvgElementNode;
  readonly baseCode: string;
  readonly baseDirty: boolean;
  readonly baseParseError: string | undefined;
  readonly baseHistory: HistoryState;
  readonly controller: CommandTransaction;
  historyPushed: boolean;
}

export function createEditorDocuments(options: {
  readonly formatter: Accessor<FormatterSettings>;
  readonly onSelectionReset: () => void;
  readonly onDocumentOpened: () => void;
  readonly onParseError: () => void;
  readonly capabilities?: SvgDocumentFactoryCapabilityIndex;
}) {
  const capabilities = options.capabilities ?? svgCapabilities;
  const [tabs, setTabs] = createSignal<readonly EditorTab[]>([createInitialTab(capabilities)]);
  const [activeTabId, setActiveTabId] = createSignal(tabs()[0]?.id ?? '');
  const [historyVersion, setHistoryVersion] = createSignal(0);
  const commandEvents = createEventBus<EditorCommandEvent>();
  const histories = new Map<string, HistoryState>();
  const fallbackDocument = createEmptySvgDocument(capabilities);
  let activeCommandTransaction: ActiveCommandTransactionState | undefined;

  const activeTab = createMemo(() => {
    const id = activeTabId();
    return tabs().find((tab) => tab.id === id) ?? tabs()[0];
  });

  const activeDocument = createMemo(() => activeTab()?.document ?? fallbackDocument);
  const activeRoot = createMemo(() => activeDocument().root);
  const activeSpatialIndex = createMemo(() => activeDocument().spatialIndex);
  const activeCode = createMemo(() => activeTab()?.code ?? '');
  const canUndo = createMemo(() => {
    historyVersion();
    return getHistory(activeTabId()).past.length > 0;
  });
  const canRedo = createMemo(() => {
    historyVersion();
    return getHistory(activeTabId()).future.length > 0;
  });

  function getHistory(tabId: string): HistoryState {
    const existing = histories.get(tabId);

    if (existing) {
      return existing;
    }

    const created = { past: [], future: [] } satisfies HistoryState;
    histories.set(tabId, created);
    return created;
  }

  function bumpHistoryVersion(): void {
    setHistoryVersion((value) => value + 1);
  }

  function updateTab(tabId: string, updater: (tab: EditorTab) => EditorTab): void {
    setTabs((items) => items.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
  }

  function updateActiveTab(updater: (tab: EditorTab) => EditorTab): void {
    updateTab(activeTabId(), updater);
  }

  function pushHistory(command?: EditorCommand): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    const previousEntry = history.past.at(-1);
    const shouldMerge = command && previousEntry && canMergeHistoryEntry(previousEntry, command);
    const nextEntry = shouldMerge
      ? createHistoryEntry(previousEntry.beforeRoot, command, capabilities)
      : createHistoryEntry(tab.document.root, command, capabilities);

    if (shouldMerge) {
      history.past[history.past.length - 1] = nextEntry;
    } else {
      history.past.push(nextEntry);
    }

    history.future.length = 0;
    bumpHistoryVersion();
  }

  function pushHistoryFromRoot(tabId: string, root: SvgElementNode, command?: EditorCommand): void {
    const history = getHistory(tabId);
    history.past.push(createHistoryEntry(root, command, capabilities));
    history.future.length = 0;
    bumpHistoryVersion();
  }

  function replaceLastHistoryEntry(tabId: string, root: SvgElementNode, command: EditorCommand): void {
    const history = getHistory(tabId);

    if (history.past.length === 0) {
      return;
    }

    history.past[history.past.length - 1] = createHistoryEntry(root, command, capabilities);
    bumpHistoryVersion();
  }

  function restoreHistory(tabId: string, history: HistoryState): void {
    histories.set(tabId, cloneHistoryState(history));
    bumpHistoryVersion();
  }

  function canMergeHistoryEntry(entry: HistoryState['past'][number], command: EditorCommand): boolean {
    return Boolean(entry.mergeKey && command.mergeKey && entry.mergeKey === command.mergeKey);
  }

  function commitRoot(nextRoot: SvgElementNode, push = true, command?: EditorCommand): void {
    if (push) {
      pushHistory(command);
    }

    const document = createSvgDocument(nextRoot, capabilities);
    updateActiveTab((tab) => ({
      ...tab,
      document,
      code: serializeSvgDocument(document, options.formatter()),
      dirty: true,
      parseError: undefined
    }));
  }

  function dispatchCommand(command: EditorCommand, history: CommandHistoryPolicy = pushCommandHistory): void {
    const currentRoot = activeRoot();
    const nextRoot = applyCommandToRoot(command, currentRoot);

    if (nextRoot === currentRoot) {
      return;
    }

    if (history.type === 'push') {
      commitRoot(nextRoot, true, command);
      commandEvents.emit({
        type: 'command.dispatched',
        tabId: activeTabId(),
        commandId: command.id,
        label: command.label,
        history: history.type
      });
      return;
    }

    replaceRootWithoutHistory(nextRoot, history.syncCode);
    commandEvents.emit({
      type: 'command.dispatched',
      tabId: activeTabId(),
      commandId: command.id,
      label: command.label,
      history: history.type
    });
  }

  function beginCommandTransaction(): CommandTransaction | undefined {
    const tab = activeTab();

    if (!tab) {
      return undefined;
    }

    const transaction = createCommandTransaction({
      tabId: tab.id,
      baseRoot: cloneRoot(tab.document.root),
      baseCode: tab.code,
      baseDirty: tab.dirty,
      baseParseError: tab.parseError,
      baseHistory: cloneHistoryState(getHistory(tab.id)),
      historyPushed: false
    });
    activeCommandTransaction = transaction;
    commandEvents.emit({ type: 'command.transaction.started', tabId: tab.id });
    return transaction.controller;
  }

  function updateCommandTransaction(command: EditorCommand): void {
    const transaction = activeCommandTransaction;

    if (!transaction) {
      dispatchCommand(command);
      return;
    }

    transaction.controller.update(command);
  }

  function updateCommandTransactionState(transaction: ActiveCommandTransactionState, command: EditorCommand): void {
    if (transaction.tabId !== activeTabId()) {
      return;
    }

    const nextRoot = applyCommandToRoot(command, transaction.baseRoot);

    if (nextRoot === activeRoot()) {
      return;
    }

    if (!transaction.historyPushed) {
      pushHistoryFromRoot(transaction.tabId, transaction.baseRoot, command);
      transaction.historyPushed = true;
    } else {
      replaceLastHistoryEntry(transaction.tabId, transaction.baseRoot, command);
    }

    replaceRootWithoutHistory(nextRoot, false);
    commandEvents.emit({
      type: 'command.transaction.updated',
      tabId: activeTabId(),
      commandId: command.id,
      label: command.label,
      historyPushed: transaction.historyPushed
    });
  }

  function commitCommandTransaction(): void {
    const transaction = activeCommandTransaction;

    if (!transaction) {
      commandEvents.emit({
        type: 'command.transaction.committed',
        tabId: activeTabId(),
        changed: false
      });
      return;
    }

    transaction.controller.commit();
  }

  function commitCommandTransactionState(transaction: ActiveCommandTransactionState): void {
    if (activeCommandTransaction !== transaction) {
      return;
    }

    activeCommandTransaction = undefined;

    if (transaction.historyPushed && transaction.tabId === activeTabId()) {
      syncActiveRootCode();
    }

    commandEvents.emit({
      type: 'command.transaction.committed',
      tabId: transaction.tabId,
      changed: transaction.historyPushed
    });
  }

  function cancelCommandTransaction(): void {
    const transaction = activeCommandTransaction;

    if (!transaction) {
      return;
    }

    transaction.controller.cancel();
  }

  function cancelCommandTransactionState(transaction: ActiveCommandTransactionState): void {
    if (activeCommandTransaction !== transaction) {
      return;
    }

    activeCommandTransaction = undefined;
    restoreHistory(transaction.tabId, transaction.baseHistory);
    updateTab(transaction.tabId, (tab) => ({
      ...tab,
      document: createSvgDocument(transaction.baseRoot, capabilities),
      code: transaction.baseCode,
      dirty: transaction.baseDirty,
      parseError: transaction.baseParseError
    }));
    commandEvents.emit({
      type: 'command.transaction.canceled',
      tabId: transaction.tabId,
      changed: transaction.historyPushed
    });
  }

  function createCommandTransaction(
    state: Omit<ActiveCommandTransactionState, 'controller'>
  ): ActiveCommandTransactionState {
    let transaction: ActiveCommandTransactionState;
    const controller = {
      tabId: state.tabId,
      changed: () => transaction.historyPushed,
      update: (command) => updateCommandTransactionState(transaction, command),
      commit: () => commitCommandTransactionState(transaction),
      cancel: () => cancelCommandTransactionState(transaction)
    } satisfies CommandTransaction;

    transaction = { ...state, controller };
    return transaction;
  }

  function replaceRootWithoutHistory(nextRoot: SvgElementNode, syncCode = true): void {
    const document = createSvgDocument(nextRoot, capabilities);
    updateActiveTab((tab) => ({
      ...tab,
      document,
      code: syncCode ? serializeSvgDocument(document, options.formatter()) : tab.code,
      dirty: true,
      parseError: undefined
    }));
  }

  function syncActiveRootCode(): void {
    updateActiveTab((tab) => ({
      ...tab,
      code: serializeSvgDocument(tab.document, options.formatter()),
      parseError: undefined
    }));
  }

  function undo(): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    const previous = history.past.pop();

    if (!previous) {
      return;
    }

    history.future.push(previous);
    const restoredRoot = restoreUndoRoot(tab.document.root, previous, capabilities);
    const document = createSvgDocument(restoredRoot, capabilities);
    updateActiveTab((item) => ({
      ...item,
      document,
      code: serializeSvgDocument(document, options.formatter()),
      dirty: true,
      parseError: undefined
    }));
    bumpHistoryVersion();
    commandEvents.emit({ type: 'history.undone', tabId: tab.id, label: previous.label });
  }

  function redo(): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    const next = history.future.pop();

    if (!next) {
      return;
    }

    history.past.push(next);
    const restoredRoot = restoreRedoRoot(tab.document.root, next, capabilities);
    const document = createSvgDocument(restoredRoot, capabilities);
    updateActiveTab((item) => ({
      ...item,
      document,
      code: serializeSvgDocument(document, options.formatter()),
      dirty: true,
      parseError: undefined
    }));
    bumpHistoryVersion();
    commandEvents.emit({ type: 'history.redone', tabId: tab.id, label: next.label });
  }

  function applyCode(text: string): void {
    const parsed = parseSvgDocument(text, capabilities);

    updateActiveTab((tab) => {
      if (!parsed.ok) {
        return { ...tab, code: text, parseError: parsed.message, dirty: true };
      }

      options.onSelectionReset();
      return {
        ...tab,
        document: parsed.document,
        code: text,
        parseError: undefined,
        dirty: true
      };
    });
  }

  function reformatActiveCode(formatter = options.formatter()): void {
    updateActiveTab((tab) => ({ ...tab, code: serializeSvgDocument(tab.document, formatter), parseError: undefined }));
  }

  function createNewTab(): void {
    const document = createEmptySvgDocument(capabilities);
    const tab = {
      id: createId(),
      name: 'Untitled.svg',
      document,
      code: serializeSvgDocument(document, options.formatter()),
      dirty: false,
      parseError: undefined
    } satisfies EditorTab;
    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
    options.onSelectionReset();
    options.onDocumentOpened();
  }

  function closeTab(tabId: string): void {
    const items = tabs();

    if (items.length <= 1) {
      createNewTab();
    }

    setTabs((current) => current.filter((tab) => tab.id !== tabId));
    histories.delete(tabId);

    if (activeTabId() === tabId) {
      const next = items.find((tab) => tab.id !== tabId);

      if (next) {
        setActiveTabId(next.id);
      }
    }
  }

  function importSvgText(text: string, name: string): void {
    const parsed = parseSvgDocument(text, capabilities);

    if (!parsed.ok) {
      updateActiveTab((tab) => ({ ...tab, code: text, parseError: parsed.message }));
      options.onParseError();
      return;
    }

    const tab = {
      id: createId(),
      name,
      document: parsed.document,
      code: serializeSvgDocument(parsed.document, options.formatter()),
      dirty: false,
      parseError: undefined
    } satisfies EditorTab;

    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
    options.onSelectionReset();
    options.onDocumentOpened();
  }

  function markActiveTabClean(): void {
    updateActiveTab((tab) => ({ ...tab, dirty: false }));
  }

  function applyCommandToRoot(command: EditorCommand, root: SvgElementNode): SvgElementNode {
    if (!isOperationBackedEditorCommand(command)) {
      return command.apply(root);
    }

    return applyEditorOperations(root, command.resolveOperations(root), capabilities);
  }

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    activeDocument,
    activeRoot,
    activeSpatialIndex,
    activeCode,
    canUndo,
    canRedo,
    commandEvents,
    dispatchCommand,
    beginCommandTransaction,
    updateCommandTransaction,
    commitCommandTransaction,
    cancelCommandTransaction,
    undo,
    redo,
    applyCode,
    reformatActiveCode,
    createNewTab,
    closeTab,
    importSvgText,
    markActiveTabClean
  };
}
