import { createEventBus } from '@solid-primitives/event-bus';
import { createMemo, createSignal, untrack, type Accessor } from 'solid-js';

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
  /** Tabs to start with, such as tabs restored from the previous session; defaults to one empty document. */
  readonly initialTabs?: { readonly tabs: readonly EditorTab[]; readonly activeTabId: string } | undefined;
}) {
  const [tabs, setTabs] = createSignal<readonly EditorTab[]>(options.initialTabs?.tabs ?? [createInitialTab()]);
  const [activeTabId, setActiveTabId] = createSignal(options.initialTabs?.activeTabId ?? untrack(tabs)[0]?.id ?? '');
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
  /**
   * Merge key of the command run that owns the latest undo step (see `EditorCommand.mergeKey`). Code-panel typing uses
   * it too, so undo restores the document from before the run instead of undoing one keystroke.
   */
  let historyMergeKey: string | undefined;

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
    historyMergeKey = undefined;
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
      const mergesIntoLastStep = command.mergeKey !== undefined && command.mergeKey === historyMergeKey;
      commitRoot(nextRoot, !mergesIntoLastStep, command);
      historyMergeKey = command.mergeKey;
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

  /** Ends the active transaction by restoring the document from before it and dropping its undo step. */
  function cancelCommandTransaction(): void {
    const transaction = activeCommandTransaction;
    activeCommandTransaction = undefined;

    if (transaction?.historyPushed) {
      getHistory(activeTabId()).past.pop();
      bumpHistoryVersion();
      replaceRootWithoutHistory(transaction.baseRoot, false);
    }

    commandEvents.emit({ type: 'command.transaction.cancelled', tabId: activeTabId() });
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

    historyMergeKey = undefined;
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

    historyMergeKey = undefined;
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

    if (!parsed.ok) {
      updateActiveTab((tab) => ({ ...tab, code: text, parseError: parsed.message, dirty: true }));
      return;
    }

    const command = codeEditCommand(parsed.document.root);

    if (historyMergeKey !== command.mergeKey) {
      pushHistory(command);
      historyMergeKey = command.mergeKey;
    }

    updateActiveTab((tab) => ({
      ...tab,
      document: parsed.document,
      code: text,
      parseError: undefined,
      dirty: true
    }));
    options.onSelectionReset();
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
    openTab(tab);
  }

  /** Adds and activates a tab; with `replaceTabId`, it takes that tab's place instead (in the same update). */
  function openTab(tab: EditorTab, replaceTabId?: string): void {
    setTabs((items) => {
      const index = replaceTabId === undefined ? -1 : items.findIndex((item) => item.id === replaceTabId);
      return index === -1 ? [...items, tab] : items.map((item, itemIndex) => (itemIndex === index ? tab : item));
    });

    if (replaceTabId !== undefined) {
      histories.delete(replaceTabId);
    }

    setActiveTabId(tab.id);
    historyMergeKey = undefined;
    options.onSelectionReset();
    options.onDocumentOpened();
  }

  /** Activates a tab, clears the selection (its node ids belong to the previous tab), and frames the document. */
  function selectTab(tabId: string): void {
    if (tabId === activeTabId()) {
      return;
    }

    setActiveTabId(tabId);
    historyMergeKey = undefined;
    options.onSelectionReset();
    options.onDocumentOpened();
  }

  /** Closes a tab without asking; closing the active tab selects its right neighbor, or the left one at the end. */
  function closeTab(tabId: string): void {
    closeTabs([tabId]);
  }

  /**
   * Closes several tabs at once without asking. When the active tab closes, the nearest remaining tab to its right
   * (else to its left) becomes active; closing every tab leaves one new empty tab.
   */
  function closeTabs(tabIds: readonly string[]): void {
    const closing = new Set(tabIds);
    const items = tabs();
    const remaining = items.filter((tab) => !closing.has(tab.id));

    if (remaining.length === items.length) {
      return;
    }

    if (remaining.length === 0) {
      createNewTab();
    }

    setTabs((current) => current.filter((tab) => !closing.has(tab.id)));

    for (const id of closing) {
      histories.delete(id);
    }

    const activeIndex = items.findIndex((tab) => tab.id === activeTabId());

    if (closing.has(activeTabId()) && remaining.length > 0) {
      const next = items.slice(activeIndex + 1).find((tab) => !closing.has(tab.id)) ?? [...items.slice(0, activeIndex)].reverse().find((tab) => !closing.has(tab.id));

      if (next) {
        selectTab(next.id);
      }
    }
  }

  /** Moves a tab to another position in the tab bar (tab dragging). */
  function moveTab(tabId: string, toIndex: number): void {
    setTabs((current) => {
      const from = current.findIndex((tab) => tab.id === tabId);
      const moving = current[from];

      if (!moving || from === toIndex) {
        return current;
      }

      const without = current.filter((tab) => tab.id !== tabId);
      return [...without.slice(0, toIndex), moving, ...without.slice(toIndex)];
    });
  }

  /**
   * Opens SVG text in a new tab and returns its id; with `replaceTabId` the new tab takes that tab's place (GodSVG
   * replaces an empty, unsaved tab). Text that fails to parse still gets its own tab, holding the original code and
   * the parse error so it can be fixed in the code panel.
   */
  function importSvgText(text: string, name: string, replaceTabId?: string): string {
    const parsed = parseSvgDocument(text);
    const id = createId();

    if (!parsed.ok) {
      openTab({ id, name, document: createEmptySvgDocument(), code: text, dirty: false, parseError: parsed.message }, replaceTabId);
      options.onParseError();
      return id;
    }

    openTab({
      id,
      name,
      document: parsed.document,
      code: serializeSvgDocument(parsed.document, options.formatter()),
      dirty: false,
      parseError: undefined
    }, replaceTabId);
    return id;
  }

  /** Renames a tab, such as after "Save SVG as" picked a new file. */
  function renameTab(tabId: string, name: string): void {
    setTabs((items) => items.map((tab) => (tab.id === tabId ? { ...tab, name } : tab)));
  }

  /** Marks a tab as saved, such as after downloading it from the tab menu. */
  function markTabClean(tabId: string): void {
    setTabs((items) => items.map((tab) => (tab.id === tabId ? { ...tab, dirty: false } : tab)));
  }

  return {
    tabs,
    activeTabId,
    selectTab,
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
    cancelCommandTransaction,
    undo,
    redo,
    applyCode,
    reformatActiveCode,
    createNewTab,
    closeTab,
    closeTabs,
    moveTab,
    markTabClean,
    importSvgText,
    renameTab
  };
}

function codeEditCommand(root: SvgElementNode): EditorCommand {
  return { id: 'code.edit', label: 'Edit code', apply: () => root, mergeKey: 'code.edit' };
}
