import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { createMemo, For, Show, untrack } from 'solid-js';

import { attrsToObject } from '../../editor/tree-utils';
import type { SvgElementNode, SvgNode } from '../../svg-model';
import { isRenderableElement, renderableAttributes, rootPresentationAttributes, svgNamespace } from './svg-render-policy';

/** Selection state and pointer callbacks shared by every rendered document node. */
export interface SvgNodeViewOptions {
  readonly selectedIds: readonly string[];
  readonly onNodePointerDown: (id: string, event: PointerEvent) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
}

/** Wraps document content in a `<g>` that carries the inheritable attributes of the document root. */
export function SvgRootPresentation(props: { readonly root: SvgElementNode; readonly children: JSX.Element }) {
  const attrs = createMemo(() => attrsToObject(rootPresentationAttributes(props.root.attrs)));

  return <g {...attrs()}>{props.children}</g>;
}

/**
 * Renders document nodes into the page.
 *
 * Rows are keyed by node id rather than object identity. The model is immutable, so an edit replaces every ancestor of
 * the edited node; keying by id updates those elements in place instead of rebuilding their subtrees.
 */
export function SvgNodeList(props: SvgNodeViewOptions & { readonly nodes: readonly SvgNode[] }) {
  return (
    <For each={props.nodes} keyed={(node) => node.id}>
      {(node) => (
        <SvgNodeView
          node={node()}
          selectedIds={props.selectedIds}
          onNodePointerDown={props.onNodePointerDown}
          openContextMenu={props.openContextMenu}
        />
      )}
    </For>
  );
}

/** Renders one document node and its children; comments, CDATA, and blocked elements render nothing. */
export function SvgNodeView(props: SvgNodeViewOptions & { readonly node: SvgNode }) {
  // A node id never changes kind, and lists key rows by id, so the branch is chosen once.
  const kind = untrack(() => props.node.kind);

  if (kind === 'text') {
    return <>{textContent(props.node)}</>;
  }

  if (kind !== 'element') {
    return null;
  }

  const element = () => props.node as SvgElementNode;
  const attrs = createMemo(() => attrsToObject(renderableAttributes(element().name, element().attrs)));
  const selected = createMemo(() => props.selectedIds.includes(element().id));

  return (
    <Show when={isRenderableElement(element().name)}>
      <Dynamic
        component={element().name}
        {...attrs()}
        xmlns={svgNamespace}
        data-node-id={element().id}
        data-testid={`svg-node-${element().id}`}
        class={[attrs().class, { 'svg-node-selected': selected() }]}
        onPointerDown={(event: PointerEvent) => {
          if (event.pointerType === 'touch' || event.button === 1 || event.altKey) {
            return;
          }

          event.stopPropagation();
          props.onNodePointerDown(element().id, event);
        }}
        onContextMenu={(event: MouseEvent) => {
          if (event.altKey) {
            event.preventDefault();
            return;
          }

          props.openContextMenu(event, element().id);
        }}
      >
        <SvgNodeList
          nodes={element().children}
          selectedIds={props.selectedIds}
          onNodePointerDown={props.onNodePointerDown}
          openContextMenu={props.openContextMenu}
        />
      </Dynamic>
    </Show>
  );
}

function textContent(node: SvgNode): string {
  return node.kind === 'text' ? node.text : '';
}
