import type { AnyTreeView } from './AnyTreeView';
import type { DefaultNode, NodeNewRoot, SavedwinNode, TabNode, WinNode } from './tree-schema';

export type BookmarksTreeView = AnyTreeView<
  'children',
  (SavedwinNode | TabNode | WinNode | (DefaultNode & { type: 'default' }) | NodeNewRoot['node']) & { id: number }
>;
