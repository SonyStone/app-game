import type { ExplorerBackend } from '../../explorer/backend';
import { createUnavailableExplorerTree } from '../../explorer/treeFactories';

/** Creates the regular-website backend used when privileged browser data is unavailable. */
export function createWebExplorerBackend(): ExplorerBackend {
  return {
    capabilities: {
      sources: { explore: false, bookmarks: false, history: false },
      commands: {
        'move-tab': false,
        'open-tab': false,
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
