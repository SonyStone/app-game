import type { ExplorerBackend } from '../../explorer/backend';
import { createUnavailableExplorerTree } from '../../explorer/treeFactories';

/** Creates the regular-website backend used when privileged browser data is unavailable. */
export function createWebExplorerBackend(): ExplorerBackend {
  return {
    capabilities: {
      sources: { explore: false, bookmarks: false, history: false },
      commands: {
        'activate-tab': false,
        'activate-window': false,
        'create-window': false,
        'create-window-at-placement': false,
        'create-google-doc-at-placement': false,
        'create-tree-snapshot': false,
        'restore-latest-tree-snapshot': false,
        'delete-tree-item': false,
        'save-close-tab': false,
        'save-close-window': false,
        'restore-saved-tab': false,
        'restore-saved-window': false,
        'restore-saved-window-session': false,
        'restore-saved-group': false,
        'create-saved-organizer': false,
        'rename-persistent-item': false,
        'cycle-saved-separator': false,
        'delete-saved-organizer': false,
        'move-saved-item': false,
        'reposition-persistent-item': false,
        'flatten-persistent-tabs': false,
        'move-tab': false,
        'move-tab-to-new-window': false,
        'move-live-tab-in-tree': false,
        'restore-saved-item-into-window': false,
        'open-tab': false,
        'open-link': false,
        'move-bookmark': false,
        'create-bookmark': false,
        'import-items': false,
        'move-document-node': false
      }
    },
    async load(source) {
      return createUnavailableExplorerTree(source);
    },
    subscribe() {
      return () => undefined;
    },
    async execute() {
      throw new Error('This website backend does not support browser mutations.');
    }
  };
}
