import { createEventBus } from '@solid-primitives/event-bus';
import { createMemo, createSignal, type Accessor } from 'solid-js';

import type { EditorCommand, EditorCommandEvent } from '../../editor/commands';
import { pushCommandHistory, type CommandHistoryPolicy } from '../../editor/commands';
import { createInitialTab } from '../../editor/defaults';
import {
  createEmptySvgDocument,
  createSvgDocument,
  parseSvgDocument,
  serializeSvgDocument
} from '../../editor/svg-document';
import type { EditorTab, HistoryEntry, HistoryState } from '../../editor/types';
import { type FormatterSettings } from '../../formatter';
import { cloneRoot, createId, type SvgElementNode } from '../../svg-model';

export function createEditorDocuments(options: {
  readonly formatter: Accessor<FormatterSettings>;
  readonly onSelectionReset: () => void;
  readonly onDocumentOpened: () => void;
  readonly onParseError: () => void;
}) {
  const [tabs, setTabs] = createSignal<readonly EditorTab[]>([createInitialTab()]);
  const [activeTabId, setActiveTabId] = createSignal(tabs()[0]?.id ?? '');
  const [historyVersion, setHistoryVersion] = createSignal(0);
  const commandEvents = createEventBus<EditorCommandEvent>();
  const histories = new Map<string, HistoryState>();
  const fallbackDocument = createEmptySvgDocument();
  let activeCommandTransaction:
    | {
        readonly baseRoot: SvgElementNode;
        historyPushed: boolean;
      }
    | undefined;

  const activeTab = createMemo(() => {
    const id = activeTabId();
    return tabs().find((tab) => tab.id === id) ?? tabs()[0];
  });

  const activeDocument = createMemo(() => activeTab()?.document ?? fallbackDocument);
  const activeRoot = createMemo(() => activeDocument().root);
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

  function updateActiveTab(updater: (tab: EditorTab) => EditorTab): void {
    const id = activeTabId();
    setTabs((items) => items.map((tab) => (tab.id === id ? updater(tab) : tab)));
  }

  function createHistoryEntry(root: SvgElementNode, command: EditorCommand | undefined): HistoryEntry {
    return {
      root: cloneRoot(root),
      commandId: command?.id,
      label: command?.label
    };
  }

  function pushHistory(command?: EditorCommand): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    history.past.push(createHistoryEntry(tab.document.root, command));
    history.future.length = 0;
    bumpHistoryVersion();
  }

  function commitRoot(nextRoot: SvgElementNode, push = true, command?: EditorCommand): void {
    if (push) {
      pushHistory(command);
    }

    const document = createSvgDocument(nextRoot);
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
    const nextRoot = command.apply(currentRoot);

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

  function beginCommandTransaction(): void {
    activeCommandTransaction = {
      baseRoot: activeRoot(),
      historyPushed: false
    };
    commandEvents.emit({ type: 'command.transaction.started', tabId: activeTabId() });
  }

  function updateCommandTransaction(command: EditorCommand): void {
    const transaction = activeCommandTransaction;

    if (!transaction) {
      dispatchCommand(command);
      return;
    }

    const nextRoot = command.apply(transaction.baseRoot);

    if (nextRoot === activeRoot()) {
      return;
    }

    if (!transaction.historyPushed) {
      pushHistory(command);
      transaction.historyPushed = true;
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
    activeCommandTransaction = undefined;

    if (transaction?.historyPushed) {
      syncActiveRootCode();
    }

    commandEvents.emit({
      type: 'command.transaction.committed',
      tabId: activeTabId(),
      changed: transaction?.historyPushed ?? false
    });
  }

  function replaceRootWithoutHistory(nextRoot: SvgElementNode, syncCode = true): void {
    const document = createSvgDocument(nextRoot);
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

    history.future.push(createHistoryEntry(tab.document.root, undefined));
    const document = createSvgDocument(previous.root);
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

    history.past.push(createHistoryEntry(tab.document.root, undefined));
    const document = createSvgDocument(next.root);
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
    const parsed = parseSvgDocument(text);

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
    const document = createEmptySvgDocument();
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
    const parsed = parseSvgDocument(text);

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

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    activeDocument,
    activeRoot,
    activeCode,
    canUndo,
    canRedo,
    commandEvents,
    dispatchCommand,
    beginCommandTransaction,
    updateCommandTransaction,
    commitCommandTransaction,
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
