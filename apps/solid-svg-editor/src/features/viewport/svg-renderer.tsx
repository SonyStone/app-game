import { createMemo, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import type { RendererContribution } from '../../editor/kernel';
import { nodeSelectionTarget } from '../../editor/selection-targets';
import { attrsToObject } from '../../editor/tree-utils';
import type { SvgNodeRendererAdapter, SvgNodeRenderProps } from './rendererAdapter';

export const defaultSvgRendererAdapter = {
  renderNode: (props) => <DefaultSvgNodeView {...props} />
} satisfies SvgNodeRendererAdapter;

export function SvgNodeView(props: SvgNodeRenderProps) {
  return (props.renderer ?? defaultSvgRendererAdapter).renderNode(props);
}

export function createSvgNodeRendererFromContributions(
  renderers: readonly RendererContribution[]
): SvgNodeRendererAdapter | undefined {
  return [...renderers].reverse().find(hasSvgNodeRendererFactory)?.createSvgNodeRenderer?.();
}

function DefaultSvgNodeView(props: SvgNodeRenderProps) {
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
        props.onSelectionTargetPointerDown(nodeSelectionTarget(node.id), event);
      }}
      onContextMenu={(event: MouseEvent) => {
        if (event.altKey) {
          event.preventDefault();
          return;
        }

        props.openSelectionTargetContextMenu(event, nodeSelectionTarget(node.id));
      }}
    >
      <For each={node.children}>
        {(child) => (
          <SvgNodeView
            node={child}
            selectedIds={props.selectedIds}
            selectedTargets={props.selectedTargets}
            onNodePointerDown={props.onNodePointerDown}
            onSelectionTargetPointerDown={props.onSelectionTargetPointerDown}
            openContextMenu={props.openContextMenu}
            openSelectionTargetContextMenu={props.openSelectionTargetContextMenu}
            {...(props.renderer ? { renderer: props.renderer } : {})}
          />
        )}
      </For>
    </Dynamic>
  );
}

function hasSvgNodeRendererFactory(
  renderer: RendererContribution
): renderer is RendererContribution & { readonly createSvgNodeRenderer: () => SvgNodeRendererAdapter } {
  return typeof renderer.createSvgNodeRenderer === 'function';
}
