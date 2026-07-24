import type { VirtualNestedItem, VirtualNestedList } from '@app-game/solid-virtual';
import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';
import {
  lineVerticalUrl,
  linetoLastSubnodeUrl,
  linetoSubnodeUrl,
  nodeAnchorCollapsedUrl,
  nodeAnchorExpandedUrl,
  nodeAnchorNoSubnodesUrl
} from '../assets';
import type { TreeViewItem } from './createTreeView';

/** Renders a generic connected virtual tree without requiring selection, keyboard, or drag-and-drop behavior. */
export function TreeView<T>(props: {
  /** Visible virtual tree levels backed by the headless tree structure and expansion state. */
  virtual: VirtualNestedList<TreeViewItem<T>>;
  /** Renders application-specific row content after the expansion anchor. */
  children: (item: TreeViewItem<T>) => JSX.Element;
  /** Optionally attaches interaction properties to each tree-item row. */
  rowProps?: (item: TreeViewItem<T>) => JSX.HTMLAttributes<HTMLDivElement>;
  /** Optionally decorates rows with application or interaction state classes. */
  rowClass?: (item: TreeViewItem<T>) => string | undefined;
}) {
  return (
    <TreeLevel
      level={props.virtual}
      root
      rowProps={props.rowProps}
      rowClass={props.rowClass}
      children={props.children}
    />
  );
}

type TreeLevelModel<T> = Pick<
  VirtualNestedList<TreeViewItem<T>>,
  'children' | 'paddingTop' | 'paddingBottom'
>;

function TreeLevel<T>(props: {
  level: TreeLevelModel<T>;
  root?: boolean;
  children: (item: TreeViewItem<T>) => JSX.Element;
  rowProps: ((item: TreeViewItem<T>) => JSX.HTMLAttributes<HTMLDivElement>) | undefined;
  rowClass: ((item: TreeViewItem<T>) => string | undefined) | undefined;
}) {
  const verticalInset = () => (props.root ? ROOT_VERTICAL_INSET : 0);

  return (
    <ul
      class="w-full min-w-0 overflow-hidden"
      role={props.root ? 'tree' : 'group'}
      style={{
        'padding-top': `${props.level.paddingTop + verticalInset()}px`,
        'padding-bottom': `${props.level.paddingBottom + verticalInset()}px`
      }}
    >
      <For each={props.level.children()}>
        {(node) => (
          <TreeBranch node={node} rowProps={props.rowProps} rowClass={props.rowClass}>
            {props.children}
          </TreeBranch>
        )}
      </For>
    </ul>
  );
}

function TreeBranch<T>(props: {
  node: VirtualNestedItem<TreeViewItem<T>>;
  children: (item: TreeViewItem<T>) => JSX.Element;
  rowProps: ((item: TreeViewItem<T>) => JSX.HTMLAttributes<HTMLDivElement>) | undefined;
  rowClass: ((item: TreeViewItem<T>) => string | undefined) | undefined;
}) {
  const item = () => props.node.item;
  const anchorUrl = () => {
    if (item().childCount === 0) {
      return nodeAnchorNoSubnodesUrl;
    }

    return item().isExpanded ? nodeAnchorExpandedUrl : nodeAnchorCollapsedUrl;
  };

  return (
    <li class="flex min-w-0 flex-col overflow-hidden ps-4 text-xs" role="none" style={treeConnectorStyle(item())}>
      <div
        {...props.rowProps?.(item())}
        data-node-id={item().id}
        role="treeitem"
        aria-expanded={item().childCount > 0 ? item().isExpanded : undefined}
        aria-level={item().depth + 1}
        class={`relative flex h-5 min-w-0 items-center overflow-hidden ${props.rowClass?.(item()) ?? ''}`}
      >
        <button
          type="button"
          aria-label={
            item().childCount === 0 ? 'Leaf node' : item().isExpanded ? 'Collapse node' : 'Expand node'
          }
          class="h-4 w-4 flex-none bg-no-repeat"
          style={{
            'background-image': `url(${anchorUrl()})`,
            'background-position': '0 1px'
          }}
          disabled={item().childCount === 0}
          onClick={item().toggle}
        />

        <Show when={item().childCount > 0 && !item().isExpanded}>
          <span class="mr-1 font-normal text-white">[{item().descendantCount}]</span>
        </Show>

        {props.children(item())}
      </div>

      <Show when={item().childCount > 0 && item().isExpanded}>
        <TreeLevel level={props.node} rowProps={props.rowProps} rowClass={props.rowClass}>
          {props.children}
        </TreeLevel>
      </Show>
    </li>
  );
}

function treeConnectorStyle<T>(item: TreeViewItem<T>) {
  if (item.depth === 0) {
    return {};
  }

  return item.isLast ? lastTreeConnectorStyle : treeConnectorStyleWithSibling;
}

const treeConnectorStyleWithSibling = {
  background: `url(${linetoSubnodeUrl}) 7px 10px no-repeat, url(${lineVerticalUrl}) 6px 2px repeat-y`
};

const lastTreeConnectorStyle = {
  background: `url(${linetoLastSubnodeUrl}) 0 0 no-repeat`
};

const ROOT_VERTICAL_INSET = 2;
