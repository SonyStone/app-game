import { createMemo, For, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { attrsToObject } from '../../editor/tree-utils';
import type { SvgNode } from '../../svg-model';

export interface SvgNodeViewProps {
  readonly node: SvgNode;
  readonly selectedIds: readonly string[];
  readonly onNodePointerDown: (id: string, event: PointerEvent) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly renderer?: SvgRendererAdapter;
}

export interface SvgRendererAdapter {
  readonly renderNode: (props: SvgNodeViewProps) => JSX.Element;
}

export const defaultSvgRendererAdapter = {
  renderNode: (props) => <DefaultSvgNodeView {...props} />
} satisfies SvgRendererAdapter;

export function SvgNodeView(props: SvgNodeViewProps) {
  return (props.renderer ?? defaultSvgRendererAdapter).renderNode(props);
}

function DefaultSvgNodeView(props: SvgNodeViewProps) {
  const node = props.node;

  if (node.kind === 'text') {
    return <>{node.text}</>;
  }

  if (node.kind === 'comment' || node.kind === 'cdata') {
    return null;
  }

  const attrs = createMemo(() => attrsToObject(node.attrs));
  const selected = createMemo(() => props.selectedIds.includes(node.id));

  return (
    <Dynamic
      component={node.name}
      {...attrs()}
      data-node-id={node.id}
      data-testid={`svg-node-${node.id}`}
      classList={{ 'svg-node-selected': selected() }}
      onPointerDown={(event: PointerEvent) => {
        if (event.pointerType === 'touch' || event.button === 1 || event.altKey) {
          return;
        }

        event.stopPropagation();
        props.onNodePointerDown(node.id, event);
      }}
      onContextMenu={(event: MouseEvent) => {
        if (event.altKey) {
          event.preventDefault();
          return;
        }

        props.openContextMenu(event, node.id);
      }}
    >
      <For each={node.children}>
        {(child) => (
          <SvgNodeView
            node={child}
            selectedIds={props.selectedIds}
            onNodePointerDown={props.onNodePointerDown}
            openContextMenu={props.openContextMenu}
            {...(props.renderer ? { renderer: props.renderer } : {})}
          />
        )}
      </For>
    </Dynamic>
  );
}
