import type { VirtualNestedItem, VirtualNestedList } from '@app-game/solid-virtual';
import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import {
  lineVerticalUrl,
  linetoLastSubnodeUrl,
  linetoSubnodeUrl,
  nodeAnchorCollapsedProtectedUrl,
  nodeAnchorCollapsedUrl,
  nodeAnchorExpandedProtectedUrl,
  nodeAnchorExpandedUrl,
  nodeAnchorNoSubnodesProtectedUrl,
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
  /** Identifies live nodes that the host cannot remove from the durable tree on close. */
  isProtected?: (item: TreeViewItem<T>) => boolean;
  /** Describes application-specific recursive counts rendered while a branch is collapsed. */
  collapsedSummary?: (item: TreeViewItem<T>) => TreeCollapsedSummary;
}) {
  return (
    <TreeLevel
      level={props.virtual}
      root
      rowProps={props.rowProps}
      rowClass={props.rowClass}
      isProtected={props.isProtected}
      collapsedSummary={props.collapsedSummary}
      children={props.children}
    />
  );
}

/** Accessible and compact segments shown before a collapsed tree row's content. */
export type TreeCollapsedSummary = Readonly<{
  /** Complete spoken description of all hidden descendants. */
  accessibleLabel: string;
  /** Ordered non-empty values separated by slashes inside square brackets. */
  segments: readonly TreeCollapsedSummarySegment[];
}>;

/** One independently explained value in a collapsed tree summary. */
export type TreeCollapsedSummarySegment = Readonly<{
  /** Compact visible value, optionally including an icon-like marker. */
  text: string;
  /** Tooltip explaining what the value counts. */
  title: string;
}>;

type TreeLevelModel<T> = Pick<VirtualNestedList<TreeViewItem<T>>, 'children' | 'paddingTop' | 'paddingBottom'>;

function TreeLevel<T>(props: {
  level: TreeLevelModel<T>;
  root?: boolean;
  children: (item: TreeViewItem<T>) => JSX.Element;
  rowProps: ((item: TreeViewItem<T>) => JSX.HTMLAttributes<HTMLDivElement>) | undefined;
  rowClass: ((item: TreeViewItem<T>) => string | undefined) | undefined;
  isProtected: ((item: TreeViewItem<T>) => boolean) | undefined;
  collapsedSummary: ((item: TreeViewItem<T>) => TreeCollapsedSummary) | undefined;
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
          <TreeBranch
            node={node}
            rowProps={props.rowProps}
            rowClass={props.rowClass}
            isProtected={props.isProtected}
            collapsedSummary={props.collapsedSummary}
          >
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
  isProtected: ((item: TreeViewItem<T>) => boolean) | undefined;
  collapsedSummary: ((item: TreeViewItem<T>) => TreeCollapsedSummary) | undefined;
}) {
  const item = () => props.node.item;
  const isProtected = () => props.isProtected?.(item()) === true;
  const anchorUrl = () => {
    if (item().childCount === 0) {
      return isProtected() ? nodeAnchorNoSubnodesProtectedUrl : nodeAnchorNoSubnodesUrl;
    }

    if (item().isExpanded) {
      return isProtected() ? nodeAnchorExpandedProtectedUrl : nodeAnchorExpandedUrl;
    }
    return isProtected() ? nodeAnchorCollapsedProtectedUrl : nodeAnchorCollapsedUrl;
  };
  const anchorLabel = () => {
    if (isProtected()) {
      return item().childCount === 0
        ? 'Protected leaf node'
        : item().isExpanded
          ? 'Protected collapse node'
          : 'Protected expand node';
    }
    return item().childCount === 0 ? 'Leaf node' : item().isExpanded ? 'Collapse node' : 'Expand node';
  };

  return (
    <li class="flex min-w-0 flex-col overflow-hidden ps-4 text-xs" role="none" style={treeConnectorStyle(item())}>
      <div
        {...props.rowProps?.(item())}
        data-node-id={item().id}
        role="treeitem"
        aria-expanded={item().childCount > 0 ? (item().isExpanded ? 'true' : 'false') : undefined}
        aria-level={item().depth + 1}
        class={`relative flex h-5 min-w-0 items-center overflow-hidden ${props.rowClass?.(item()) ?? ''}`}
      >
        <button
          type="button"
          aria-label={anchorLabel()}
          class="h-4 w-4 flex-none bg-no-repeat"
          style={{
            'background-image': `url(${anchorUrl()})`,
            'background-position': '0 1px'
          }}
          disabled={item().childCount === 0}
          onClick={item().toggle}
        />

        <Show when={item().childCount > 0 && !item().isExpanded}>
          <CollapsedSummaryButton item={item()} summary={props.collapsedSummary?.(item())} />
        </Show>

        {props.children(item())}
      </div>

      <Show when={item().childCount > 0 && item().isExpanded}>
        <TreeLevel
          level={props.node}
          rowProps={props.rowProps}
          rowClass={props.rowClass}
          isProtected={props.isProtected}
          collapsedSummary={props.collapsedSummary}
        >
          {props.children}
        </TreeLevel>
      </Show>
    </li>
  );
}

function CollapsedSummaryButton<T>(props: { item: TreeViewItem<T>; summary: TreeCollapsedSummary | undefined }) {
  const segments = () =>
    props.summary?.segments ?? [{ text: String(props.item.descendantCount), title: 'Hidden nodes' }];
  return (
    <button
      type="button"
      class="mr-1 flex h-4 flex-none items-center font-normal text-white hover:bg-neutral-700"
      aria-label={props.summary?.accessibleLabel ?? `${props.item.descendantCount} hidden nodes`}
      title="Expand hidden nodes"
      onClick={props.item.toggle}
    >
      <span aria-hidden="true">[</span>
      <For each={segments()}>
        {(segment, index) => (
          <>
            <Show when={index() > 0}>/</Show>
            <span title={segment.title}>{segment.text}</span>
          </>
        )}
      </For>
      <span aria-hidden="true">]</span>
    </button>
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
