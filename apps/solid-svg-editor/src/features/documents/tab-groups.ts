import type { EditorTab } from '../../editor/types';

/** Which tabs each of GodSVG's "close" actions closes, relative to the tab at `index`. */
export type TabCloseGroup = 'close' | 'close-others' | 'close-left' | 'close-right' | 'close-empty' | 'close-saved';

/** The ids of the tabs a close action affects; empty when there is nothing to close (or `index` is out of range). */
export function tabsToClose(tabs: readonly EditorTab[], index: number, group: TabCloseGroup): readonly string[] {
  if (index < 0 || index >= tabs.length) {
    return [];
  }

  const ids = (items: readonly EditorTab[]) => items.map((tab) => tab.id);

  switch (group) {
    case 'close':
      return ids(tabs.slice(index, index + 1));
    case 'close-others':
      return ids(tabs.filter((_, item) => item !== index));
    case 'close-left':
      return ids(tabs.slice(0, index));
    case 'close-right':
      return ids(tabs.slice(index + 1));
    case 'close-empty':
      return ids(tabs.filter((tab) => tab.document.root.children.length === 0));
    case 'close-saved':
      return ids(tabs.filter((tab) => !tab.dirty));
  }
}
