import { createEffect, createMemo, createSignal, For, Index, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { svgCapabilities, type SvgCapabilityRegistry } from '../../editor/capabilities';
import type { EditorCommand } from '../../editor/commands';
import { createSetAttributeCommand } from '../../editor/commands/attributeCommands';
import {
  createAddElementCommand,
  createReorderNodesCommand,
  createUpdateTextNodeCommand
} from '../../editor/commands/nodeCommands';
import type { EditorKernel } from '../../editor/kernel';
import { decorativeIconProps } from '../../editor/svg-icon';
import { nodeSelectionTarget, type SelectionTarget } from '../../editor/selection-targets';
import { findNode, findParent, nodeLabel, type DropPosition, type SvgElementNode, type SvgNode } from '../../svg-model';
import { AttributeGrid, RootElementEditor } from './InspectorInputs';
import { createInspectorVirtualScroll, nodeContainsId, VirtualInspectorRowShell } from './InspectorVirtualScroll';
import { createRafQueue } from '../ui/createRafQueue';
import PlusIcon from '../ui/icons/Plus.svg';
import WarningIcon from '../ui/icons/Warning.svg';

type InspectorDropTarget = {
  readonly nodeId: string;
  readonly position: DropPosition;
  readonly valid: boolean;
};

export function InspectorPanel<TPanelContext>(props: { readonly kernel: EditorKernel<TPanelContext> }) {
  const [addOpen, setAddOpen] = createSignal(false);
  const [draggingIds, setDraggingIds] = createSignal<readonly string[]>([]);
  const [dropTarget, setDropTarget] = createSignal<InspectorDropTarget>();
  const [dragPreviewPoint, setDragPreviewPoint] = createSignal<{ readonly x: number; readonly y: number }>();
  const root = () => props.kernel.documents.activeRoot();
  const capabilities = () => props.kernel.capabilities.svg;
  const selectedIds = () => props.kernel.selection.selectedIds();
  const selectedTargets = () => props.kernel.selection.selectedTargets();
  const virtualScroll = createInspectorVirtualScroll({ root });
  let suppressNextSelectionScroll = false;
  let pendingSelectionScrollId: string | undefined;
  const alignSelectedRowOnSecondFrame = createRafQueue(() => {
    const selectedId = pendingSelectionScrollId;

    if (selectedId) {
      virtualScroll.alignMountedRowToTop(selectedId);
    }
  });
  const alignSelectedRowOnNextFrame = createRafQueue(() => {
    const selectedId = pendingSelectionScrollId;

    if (!selectedId) {
      return;
    }

    virtualScroll.scrollRowToTop(selectedId);
    virtualScroll.alignMountedRowToTop(selectedId);
    alignSelectedRowOnSecondFrame.schedule();
  });

  const dragPreviewNodes = createMemo(() =>
    draggingIds()
      .map((id) => findNode(root(), id))
      .filter((node): node is SvgNode => Boolean(node))
  );

  createEffect(() => {
    const ids = selectedIds();
    const selectedId = ids[ids.length - 1];

    if (!selectedId) {
      return;
    }

    if (suppressNextSelectionScroll) {
      suppressNextSelectionScroll = false;
      return;
    }

    queueMicrotask(() => {
      pendingSelectionScrollId = selectedId;
      virtualScroll.scrollRowToTop(selectedId);
      alignSelectedRowOnNextFrame.schedule();
    });
  });

  function selectNodeFromInspector(id: string, event?: MouseEvent | PointerEvent): void {
    suppressNextSelectionScroll = true;
    props.kernel.selection.selectNode(id, event);
    queueMicrotask(() => {
      suppressNextSelectionScroll = false;
    });
  }

  function openContextMenuFromInspector(event: MouseEvent, nodeId: string): void {
    suppressNextSelectionScroll = true;
    props.kernel.ui.contextMenu?.open(event, nodeId);
    queueMicrotask(() => {
      suppressNextSelectionScroll = false;
    });
  }

  function resetInspectorDrag(): void {
    setDraggingIds([]);
    setDropTarget(undefined);
    setDragPreviewPoint(undefined);
  }

  function dragIdsForNode(nodeId: string): readonly string[] {
    const selected = selectedIds().filter((id) => id !== root().id);
    return selected.includes(nodeId) ? selected : [nodeId];
  }

  function updateDragPoint(event: DragEvent): void {
    setDragPreviewPoint({ x: event.clientX, y: event.clientY });
  }

  function startInspectorDrag(nodeId: string, event: DragEvent): void {
    const ids = dragIdsForNode(nodeId);

    if (ids.length === 0) {
      event.preventDefault();
      return;
    }

    selectNodeFromInspector(nodeId);
    setDraggingIds(ids);
    updateDragPoint(event);
    event.dataTransfer?.setData('application/x-solid-svg-node-ids', ids.join(','));

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function updateInspectorDropTarget(node: SvgNode, event: DragEvent): void {
    const ids = draggingIds();

    if (ids.length === 0) {
      return;
    }

    event.preventDefault();
    updateDragPoint(event);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const position = dropPositionForEvent(node, event);
    setDropTarget({ nodeId: node.id, position, valid: isDropTargetValid(ids, node.id, position) });
  }

  function dropInspectorNodes(node: SvgNode, event: DragEvent): void {
    const target = dropTarget();

    if (!target || target.nodeId !== node.id) {
      resetInspectorDrag();
      return;
    }

    event.preventDefault();

    if (target.valid) {
      reorderNodes(draggingIds(), target.nodeId, target.position);
    }

    resetInspectorDrag();
  }

  function dispatchCommand(command: EditorCommand): void {
    props.kernel.commands.dispatch(command);
  }

  function reorderNodes(nodeIds: readonly string[], targetId: string, position: DropPosition): void {
    const ids = nodeIds.filter((id) => id !== root().id);

    if (ids.length === 0) {
      return;
    }

    dispatchCommand(createReorderNodesCommand(ids, targetId, position));
    props.kernel.selection.setSelectedTargets(ids.map(nodeSelectionTarget));
  }

  function addElement(name: string): void {
    const add = createAddElementCommand({
      root: root(),
      selectedNodes: props.kernel.selection.selectedNodes(),
      name,
      capabilities: capabilities()
    });

    dispatchCommand(add.command);
    props.kernel.selection.setSelectedTargets([nodeSelectionTarget(add.nodeId)]);
  }

  function updateElementAttribute(nodeId: string, name: string, value: string): void {
    dispatchCommand(createSetAttributeCommand(nodeId, name, value));
  }

  function updateBasicNodeText(nodeId: string, text: string): void {
    dispatchCommand(createUpdateTextNodeCommand(nodeId, text));
  }

  function dropPositionForEvent(node: SvgNode, event: DragEvent): DropPosition {
    if (node.id === root().id) {
      return 'inside';
    }

    const currentTarget = event.currentTarget;
    const rect = currentTarget instanceof HTMLElement ? currentTarget.getBoundingClientRect() : undefined;
    const rectHeight = rect?.height ?? 0;
    const rectTop = rect?.top ?? event.clientY;
    const y = rectHeight > 0 ? (event.clientY - rectTop) / rectHeight : 0.5;

    if (node.kind === 'element' && y > 0.27 && y < 0.73) {
      return 'inside';
    }

    return y < 0.5 ? 'before' : 'after';
  }

  function isDropTargetValid(ids: readonly string[], targetId: string, position: DropPosition): boolean {
    const currentRoot = root();
    const target = findNode(currentRoot, targetId);
    const parent = position === 'inside' && target?.kind === 'element' ? target : findParent(currentRoot, targetId);

    if (!target || !parent) {
      return false;
    }

    for (const id of ids) {
      const node = findNode(currentRoot, id);

      if (!node || node.id === currentRoot.id || nodeContainsId(node, parent.id)) {
        return false;
      }

      if (node.kind === 'element' && !capabilities().isValidChild(parent.name, node.name)) {
        return false;
      }
    }

    return true;
  }

  return (
    <section class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-[var(--soft-border)] bg-[var(--panel)]" data-testid="inspector-panel">
      <div class="relative flex items-center gap-1.5 border-b border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5" data-testid="inspector-toolbar">
        <button
          class="inline-flex min-h-6.5 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] border border-[color-mix(in_srgb,var(--accent)_52%,var(--soft-border))] bg-[var(--panel-2)] px-2.5 text-[var(--text)] hover:border-[var(--accent)]"
          type="button"
          data-testid="add-element-button"
          onClick={() => setAddOpen(!addOpen())}
        >
          <PlusIcon {...decorativeIconProps} />{' '}
          Add element
        </button>
        <Show when={addOpen()}>
          <div class="absolute top-9 left-1.5 z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] p-1.25 shadow-[0_12px_28px_#0008] [background:color-mix(in_srgb,var(--panel)_96%,#000)]" data-testid="add-element-menu">
            <For each={capabilities().addableElements}>
              {(element) => (
                <button
                  class="flex min-h-7 cursor-pointer items-center gap-2 rounded bg-transparent px-2 text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)]"
                  type="button"
                  data-testid={`add-element-option-${element.name}`}
                  onClick={() => {
                    addElement(element.name);
                    setAddOpen(false);
                  }}
                >
                  <Dynamic component={element.icon} {...decorativeIconProps} />{' '}
                  {element.name}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div
        class="min-h-0 overflow-auto p-1.25"
        data-testid="inspector-scroller"
        ref={virtualScroll.setScrollerRef}
        onScroll={(event) => virtualScroll.setScrollTop(event.currentTarget.scrollTop)}
      >
        <RootElementEditor
          root={root()}
          capabilities={capabilities()}
          dispatchCommand={dispatchCommand}
          selectTarget={props.kernel.selection.selectTarget}
          updateElementAttribute={updateElementAttribute}
        />
        <div
          ref={virtualScroll.setVirtualSpacerRef}
          class="relative mt-1.25 min-h-full"
          data-testid="inspector-virtual-spacer"
          style={{ height: `${virtualScroll.virtualSpacerHeight()}px` }}
        >
          <div
            class="absolute inset-x-0 top-0 will-change-transform"
            data-testid="inspector-visible-window"
            style={{ transform: `translateY(${virtualScroll.visibleWindow().paddingTop}px)` }}
          >
            <Index each={virtualScroll.visibleWindow().rows}>
              {(row) => (
                <VirtualInspectorRowShell row={row()} measureRow={virtualScroll.measureRow}>
                  <ElementCard
                    node={row().node}
                    capabilities={capabilities()}
                    depth={row().depth}
                    root={root()}
                    selectedIds={selectedIds()}
                    selectedTargets={selectedTargets()}
                    selectTarget={props.kernel.selection.selectTarget}
                    selectNode={selectNodeFromInspector}
                    dispatchCommand={dispatchCommand}
                    updateElementAttribute={updateElementAttribute}
                    updateBasicNodeText={updateBasicNodeText}
                    openContextMenu={openContextMenuFromInspector}
                    draggingIds={draggingIds()}
                    dropTarget={dropTarget()}
                    startInspectorDrag={startInspectorDrag}
                    updateInspectorDropTarget={updateInspectorDropTarget}
                    dropInspectorNodes={dropInspectorNodes}
                    resetInspectorDrag={resetInspectorDrag}
                    renderChildren={false}
                  />
                </VirtualInspectorRowShell>
              )}
            </Index>
            <div style={{ height: `${virtualScroll.visibleWindow().paddingBottom}px` }} />
          </div>
        </div>
      </div>
      <Show when={dragPreviewPoint()}>
        {(point) => (
          <div
            class="pointer-events-none fixed z-1000 grid w-90 max-w-[min(360px,calc(100vw-24px))] gap-1 opacity-[0.85]"
            data-testid="inspector-drag-preview"
            style={{ left: `${point().x + 14}px`, top: `${point().y + 10}px` }}
          >
            <For each={dragPreviewNodes()}>
              {(node) => (
                <div class="flex h-6 items-center justify-center gap-1.5 rounded border-2 border-[#3d86ff] font-['GodSVG_Mono',ui-monospace,monospace] text-xs text-[#eef4ff] shadow-[0_10px_24px_rgb(0_0_0/30%)] [background:color-mix(in_srgb,#30569c_52%,var(--panel))]" data-testid={`inspector-drag-preview-node-${node.id}`}>
                  <Dynamic
                    component={node.kind === 'element' ? capabilities().iconForElement(node.name) : capabilities().iconForNode(node.kind)}
                    {...decorativeIconProps}
                  />
                  <span>{inspectorTitle(node)}</span>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </section>
  );
}

function ElementCard(props: {
  readonly node: SvgNode;
  readonly capabilities?: SvgCapabilityRegistry;
  readonly depth: number;
  readonly root: SvgElementNode;
  readonly selectedIds: readonly string[];
  readonly selectedTargets: readonly SelectionTarget[];
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
  readonly selectNode: (id: string, event?: MouseEvent | PointerEvent) => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly updateBasicNodeText: (nodeId: string, text: string) => void;
  readonly openContextMenu: (event: MouseEvent, nodeId: string) => void;
  readonly draggingIds: readonly string[];
  readonly dropTarget: InspectorDropTarget | undefined;
  readonly startInspectorDrag: (nodeId: string, event: DragEvent) => void;
  readonly updateInspectorDropTarget: (node: SvgNode, event: DragEvent) => void;
  readonly dropInspectorNodes: (node: SvgNode, event: DragEvent) => void;
  readonly resetInspectorDrag: () => void;
  readonly renderChildren?: boolean;
}) {
  const capabilities = () => props.capabilities ?? svgCapabilities;
  const isSelected = () => props.selectedIds.includes(props.node.id);
  const tint = () => `hsl(${268 + props.depth * 18}deg 52% ${props.depth === 0 ? 11 : 14}%)`;
  const dropState = () => (props.dropTarget?.nodeId === props.node.id ? props.dropTarget : undefined);
  const isDragging = () => props.draggingIds.includes(props.node.id);

  return (
    <article
      class="relative mb-1 overflow-visible rounded-[5px] border border-[color-mix(in_srgb,var(--card-tint)_42%,var(--soft-border))] [background:color-mix(in_srgb,var(--card-tint)_72%,var(--panel))]"
      classList={{
        'cursor-grab': props.node.id !== props.root.id,
        'border-[var(--accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_68%,transparent)]':
          isSelected(),
        'opacity-[0.55]': isDragging()
      }}
      data-inspector-node-id={props.node.id}
      data-testid={`inspector-node-${props.node.id}`}
      style={{ '--card-tint': tint() }}
      draggable={props.node.id !== props.root.id}
      onDragStart={(event) => props.startInspectorDrag(props.node.id, event)}
      onDragOver={(event) => props.updateInspectorDropTarget(props.node, event)}
      onDrop={(event) => props.dropInspectorNodes(props.node, event)}
      onDragEnd={props.resetInspectorDrag}
    >
      <Show when={dropState()}>
        {(target) => (
          <div
            class="pointer-events-none absolute z-10 border-[#78ff78]"
            classList={{
              'inset-x-0 -top-0.5 border-t-2': target().position === 'before',
              'inset-x-0 -bottom-0.5 border-b-2': target().position === 'after',
              '-inset-0.5 rounded-[5px] border-2': target().position === 'inside',
              'border-[var(--warning)]': !target().valid
            }}
          />
        )}
      </Show>
      <button
        type="button"
        class="flex h-5.5 w-full cursor-pointer items-center justify-center gap-1.25 rounded-t border-0 border-b border-b-[color-mix(in_srgb,var(--card-tint)_50%,var(--soft-border))] font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[#eef4ff] [background:color-mix(in_srgb,var(--card-tint)_64%,var(--panel-2))] hover:bg-[color-mix(in_srgb,var(--accent)_14%,var(--panel-2))] hover:text-white"
        draggable={props.node.id !== props.root.id}
        data-testid={`inspector-node-header-${props.node.id}`}
        onClick={(event) => props.selectNode(props.node.id, event)}
        onContextMenu={(event) => props.openContextMenu(event, props.node.id)}
        onDragStart={(event) => props.startInspectorDrag(props.node.id, event)}
        onDragEnd={props.resetInspectorDrag}
      >
        <Dynamic
          component={props.node.kind === 'element' ? capabilities().iconForElement(props.node.name) : capabilities().iconForNode(props.node.kind)}
          {...decorativeIconProps}
        />
        <span>{inspectorTitle(props.node)}</span>
        <Show
          when={
            props.node.kind === 'element' && props.node.name !== 'svg' && capabilities().getElement(props.node.name) === undefined
          }
        >
          <WarningIcon {...decorativeIconProps} />
        </Show>
      </button>

      <Show
        when={props.node.kind === 'element' ? props.node : undefined}
        fallback={
          <textarea
            class="m-1.5 min-h-16 w-[calc(100%-12px)] min-w-0 resize-y rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel)] font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
            data-testid={`inspector-text-node-editor-${props.node.id}`}
            value={props.node.kind === 'element' ? '' : props.node.text}
            onInput={(event) => props.updateBasicNodeText(props.node.id, event.currentTarget.value)}
          />
        }
      >
        {(node) => (
          <>
            <AttributeGrid
              root={props.root}
              node={node()}
              capabilities={capabilities()}
              dispatchCommand={props.dispatchCommand}
              updateElementAttribute={props.updateElementAttribute}
              selectedTargets={props.selectedTargets}
              selectTarget={props.selectTarget}
            />
            <Show when={props.renderChildren !== false && node().children.length > 0}>
              <div class="px-1.25 pb-1.25" data-testid={`inspector-node-children-${node().id}`}>
                <For each={node().children}>
                  {(child) => (
                    <ElementCard
                      node={child}
                      capabilities={capabilities()}
                      depth={props.depth + 1}
                      root={props.root}
                      selectedIds={props.selectedIds}
                      selectedTargets={props.selectedTargets}
                      selectTarget={props.selectTarget}
                      selectNode={props.selectNode}
                      dispatchCommand={props.dispatchCommand}
                      updateElementAttribute={props.updateElementAttribute}
                      updateBasicNodeText={props.updateBasicNodeText}
                      openContextMenu={props.openContextMenu}
                      draggingIds={props.draggingIds}
                      dropTarget={props.dropTarget}
                      startInspectorDrag={props.startInspectorDrag}
                      updateInspectorDropTarget={props.updateInspectorDropTarget}
                      dropInspectorNodes={props.dropInspectorNodes}
                      resetInspectorDrag={props.resetInspectorDrag}
                    />
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </article>
  );
}

function inspectorTitle(node: SvgNode): string {
  return node.kind === 'element' ? node.name : nodeLabel(node);
}
