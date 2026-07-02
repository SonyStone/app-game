import { createMemo, createSignal, type Accessor } from 'solid-js';

import { createInitialTab } from '../../editor/defaults';
import type { EditorTab, HistoryState } from '../../editor/types';
import { serializeRoot, type FormatterSettings } from '../../formatter';
import { cloneRoot, createDefaultRoot, createId, parseSvgMarkup, type SvgElementNode } from '../../svg-model';

export function createEditorDocuments(options: {
  readonly formatter: Accessor<FormatterSettings>;
  readonly onSelectionReset: () => void;
  readonly onDocumentOpened: () => void;
  readonly onParseError: () => void;
}) {
  const [tabs, setTabs] = createSignal<readonly EditorTab[]>([createInitialTab()]);
  const [activeTabId, setActiveTabId] = createSignal(tabs()[0]?.id ?? '');
  const [historyVersion, setHistoryVersion] = createSignal(0);
  const histories = new Map<string, HistoryState>();
  const fallbackRoot = createDefaultRoot();

  const activeTab = createMemo(() => {
    const id = activeTabId();
    return tabs().find((tab) => tab.id === id) ?? tabs()[0];
  });

  const activeRoot = createMemo(() => activeTab()?.root ?? fallbackRoot);
  const activeCode = createMemo(() => activeTab()?.code ?? '');
  const canUndo = createMemo(() => getHistory(activeTabId()).past.length > 0 && historyVersion() >= 0);
  const canRedo = createMemo(() => getHistory(activeTabId()).future.length > 0 && historyVersion() >= 0);

  function getHistory(tabId: string): HistoryState {
    const existing = histories.get(tabId);

    if (existing) {
      return existing;
    }

    const created = { past: [], future: [] };
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

  function pushHistory(): void {
    const tab = activeTab();

    if (!tab) {
      return;
    }

    const history = getHistory(tab.id);
    history.past.push(cloneRoot(tab.root));
    history.future.length = 0;
    bumpHistoryVersion();
  }

  function commitRoot(nextRoot: SvgElementNode, push = true): void {
    if (push) {
      pushHistory();
    }

    updateActiveTab((tab) => ({
      ...tab,
      root: nextRoot,
      code: serializeRoot(nextRoot, options.formatter()),
      dirty: true,
      parseError: undefined
    }));
  }

  function mutateRoot(updater: (root: SvgElementNode) => SvgElementNode, push = true): void {
    commitRoot(updater(activeRoot()), push);
  }

  function replaceRootWithoutHistory(nextRoot: SvgElementNode, syncCode = true): void {
    updateActiveTab((tab) => ({
      ...tab,
      root: nextRoot,
      code: syncCode ? serializeRoot(nextRoot, options.formatter()) : tab.code,
      dirty: true,
      parseError: undefined
    }));
  }

  function syncActiveRootCode(): void {
    updateActiveTab((tab) => ({
      ...tab,
      code: serializeRoot(tab.root, options.formatter()),
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

    history.future.push(cloneRoot(tab.root));
    updateActiveTab((item) => ({
      ...item,
      root: previous,
      code: serializeRoot(previous, options.formatter()),
      dirty: true,
      parseError: undefined
    }));
    bumpHistoryVersion();
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

    history.past.push(cloneRoot(tab.root));
    updateActiveTab((item) => ({
      ...item,
      root: next,
      code: serializeRoot(next, options.formatter()),
      dirty: true,
      parseError: undefined
    }));
    bumpHistoryVersion();
  }

  function applyCode(text: string): void {
    const parsed = parseSvgMarkup(text);

    updateActiveTab((tab) => {
      if (!parsed.ok) {
        return { ...tab, code: text, parseError: parsed.message, dirty: true };
      }

      options.onSelectionReset();
      return {
        ...tab,
        root: parsed.root,
        code: text,
        parseError: undefined,
        dirty: true
      };
    });
  }

  function reformatActiveCode(formatter = options.formatter()): void {
    updateActiveTab((tab) => ({ ...tab, code: serializeRoot(tab.root, formatter), parseError: undefined }));
  }

  function createNewTab(): void {
    const root = createDefaultRoot();
    const tab = {
      id: createId(),
      name: 'Untitled.svg',
      root,
      code: serializeRoot(root, options.formatter()),
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
    const parsed = parseSvgMarkup(text);

    if (!parsed.ok) {
      updateActiveTab((tab) => ({ ...tab, code: text, parseError: parsed.message }));
      options.onParseError();
      return;
    }

    const tab = {
      id: createId(),
      name,
      root: parsed.root,
      code: serializeRoot(parsed.root, options.formatter()),
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
    activeRoot,
    activeCode,
    canUndo,
    canRedo,
    updateActiveTab,
    pushHistory,
    commitRoot,
    mutateRoot,
    replaceRootWithoutHistory,
    syncActiveRootCode,
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
