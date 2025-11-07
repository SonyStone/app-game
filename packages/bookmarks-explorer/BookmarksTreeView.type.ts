import type { AnyTreeView } from './AnyTreeView';
import type { DefaultNode, NodeNewRoot, SavedwinNode } from './tree-schema';

export type BookmarksTreeView = AnyTreeView<
  'children',
  (SavedwinNode | (DefaultNode & { type: 'default' }) | NodeNewRoot['node']) & { id: number }
>;
