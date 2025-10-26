import { createLazyMemo } from '@solid-primitives/memo';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import {
  chromeWindowIconGoldUrl,
  chromeWindowIconGrayUrl,
  faviconUrl,
  linetoLastSubnodeUrl,
  linetoSubnodeUrl,
  lineVerticalUrl,
  nodeAnchorExpandedUrl,
  nodeAnchorNoSubnodesUrl,
  noFaviconUrl
} from './assets';
import { BookmarksTreeView } from './BookmarksTreeView.type';
import { useDragAndDropContext } from './createDragHandler';
import type { AnyTreeView } from './insertChildrenAtPath';
import type { DefaultNode, SavedwinNode } from './tree-schema';
import { childPath, Path, siblingPath } from './TreeViewUtils';

const expandedsubnodes = {
  background: `url(${nodeAnchorExpandedUrl}) 0px -1px no-repeat`
} as const;

const nodeTitleAndSubnodesContainer = {
  background: `url(${linetoSubnodeUrl}) 7px 8px no-repeat, url(${lineVerticalUrl}) 6px 0px repeat-y`
};

const nodeTitleAndSubnodesContainerLast = {
  background: `url(${linetoLastSubnodeUrl}) 0px -2px no-repeat`
};

const nosubnodes = {
  background: `url(${nodeAnchorNoSubnodesUrl}) 0px -1px no-repeat`
};

export function NodeItem(
  props: Partial<{
    node: BookmarksTreeView;
    isLast: boolean;
    path: Path;
  }>
) {
  const allDescendantsCount = createLazyMemo(() => countAllDescendants(props.node));

  const hasSubnodes = createLazyMemo(() => {
    return props.node?.children && props.node.children.length > 0;
  });

  const [isCollapsed, setIsCollapsed] = createSignal(props.node?.colapsed ?? false);

  // Render children nodes in memory
  // This avoids re-creating the children nodes on each collapse/expand action
  const children = (
    <Show when={hasSubnodes()}>
      <ul>
        <For each={props.node?.children}>
          {(child, i) => (
            <NodeItem
              node={child}
              path={[...(props.path ?? []), i()]}
              isLast={i() === (props.node?.children?.length ?? 1) - 1}
            />
          )}
        </For>
      </ul>
    </Show>
  );

  const { dragHandlers, droppable } = useDragAndDropContext();

  return (
    <li
      style={props.isLast ? nodeTitleAndSubnodesContainerLast : nodeTitleAndSubnodesContainer}
      {...droppable()}
      data-path-to={siblingPath(props.path, +1)}
      class="py-0.25 flex flex-col ps-4"
    >
      <div
        class="flex"
        data-path-to={childPath(props.path, 0)}
        data-path-from={props.path}
        {...droppable({ hasSubnodes: true })}
        {...dragHandlers({ data: props.node })}
      >
        <button
          style={hasSubnodes() ? expandedsubnodes : nosubnodes}
          class="h-4 w-4 flex-shrink-0"
          disabled={!hasSubnodes()}
          onClick={() => setIsCollapsed(!isCollapsed())}
        ></button>

        <pre class="text-muted-foreground text-xs">[{props.path?.join(',')}]</pre>

        <Show when={isCollapsed()}>
          <span class="text-muted-foreground text-xs">[{allDescendantsCount()}]</span>
        </Show>

        <Switch fallback={<UnknownNode />}>
          <Match when={props.node?.type === 'default'}>
            <BookmarksLinkNode node={props.node as DefaultNode} />
          </Match>
          <Match when={props.node?.type === 'session'}>
            <SessionNode />
          </Match>
          <Match when={props.node?.type === 'savedwin'}>
            <SavedWinNode node={props.node as SavedwinNode} />
          </Match>
        </Switch>
      </div>
      {!isCollapsed() && children}
    </li>
  );
}

function countAllDescendants(node?: AnyTreeView<'children'>): number {
  if (!node) {
    return 0;
  }
  let count = 0;

  // Get all direct children of the current element
  const children = node.children ?? [];

  // Add the count of direct children
  count += children.length;

  // Recursively call the function for each child to count their descendants
  for (let i = 0; i < children.length; i++) {
    count += countAllDescendants(children[i]);
  }

  return count;
}

function UnknownNode() {
  return (
    <div class="flex h-4 flex-1">
      <span class="truncate text-xs">Unknown Node</span>
    </div>
  );
}

/** Root Node */
function SessionNode() {
  return (
    <div class="flex h-4 flex-1">
      <img
        class="mr-1 inline-block h-4 w-4 select-none align-middle"
        src={faviconUrl}
        alt="favicon"
        draggable="false"
      />
      <span class="truncate text-xs">Current Session</span>
    </div>
  );
}

/** Browser Window Node */
function SavedWinNode(props: Partial<{ node: SavedwinNode }>) {
  const icon = createMemo(() => {
    if (props.node?.marks.customFavicon === 'img/chrome-window-icon-gold.png') {
      return chromeWindowIconGoldUrl;
    }
    return chromeWindowIconGrayUrl;
  });

  return (
    <div class="flex h-4 flex-1">
      <img class="mr-1 inline-block h-4 w-4 select-none align-middle" src={icon()} alt="favicon" draggable="false" />
      <span class="truncate text-xs">
        {props.node?.marks.customTitle ?? 'Window'}
        <Show when={props.node?.data?.closeDate}>
          {(closeDate) => <> (closed {new Date(closeDate()).toDateString()})</>}
        </Show>
        <Show when={props.node?.data?.crashDetectedDate}>
          {(crashDetectedDate) => <> (crashed {new Date(crashDetectedDate()).toDateString()})</>}
        </Show>
      </span>
    </div>
  );
}

/** Link Node */
function BookmarksLinkNode(props: Partial<{ node: DefaultNode }>) {
  return (
    <a
      class="hover:bg-accent flex h-4 flex-1 pe-5"
      href={props.node?.data?.url}
      target="_blank"
      rel="noopener noreferrer"
      draggable="false"
      onClick={(e) => e.preventDefault()}
      onDblClick={() => {
        window.open(props.node?.data?.url, '_blank', 'noopener');
      }}
    >
      <img
        class="mr-1 inline-block h-4 w-4 select-none align-middle"
        src={props.node?.data?.favIconUrl ?? noFaviconUrl}
        draggable="false"
        alt="favicon"
        onError={(e) => {
          e.preventDefault();
          (e.target as HTMLImageElement).src = noFaviconUrl;
        }}
      />
      <span class=" truncate text-xs">{props.node?.data?.title}</span>
    </a>
  );
}
