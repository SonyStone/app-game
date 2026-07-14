import { describe, expect, it } from 'vitest';

import type { CommandTransaction, EditorCommand } from '../src/editor/commands';
import type { Point, Rect } from '../src/editor/geometry';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import {
  nodeIdsFromSelectionTargets,
  nodeSelectionTarget,
  pathCommandSelectionTarget,
  type SelectionTarget
} from '../src/editor/selection-targets';
import { createSvgSpatialIndex } from '../src/editor/svg-spatial-index';
import type { ActiveDrag, ActiveMarqueeDrag } from '../src/editor/types';
import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  createElementNode,
  findNode,
  getAttribute,
  resetIdCounter,
  type SvgElementNode
} from '../src/svg-model';
import { createSelectionToolController } from '../src/features/viewport/tools/selectionToolController';
import type { ViewportRendererAdapter } from '../src/features/viewport/rendererAdapter';

describe('createSelectionToolController', () => {
  it('starts move-selection drags from node pointer down', () => {
    resetIdCounter();
    const baseRoot = createDefaultRoot();
    const root = appendChild(baseRoot, baseRoot.id, createDefaultElement('rect'));
    const rect = root.children[0];

    if (!rect) {
      throw new Error('Expected rect');
    }

    let selectedTargets: readonly SelectionTarget[] = [];
    let activeDrag: ActiveDrag | undefined;
    let transactions = 0;
    const controller = createSelectionToolController({
      ...baseOptions(root),
      selectedIds: () => nodeIdsFromSelectionTargets(selectedTargets),
      setSelectedTargets: (targets) => {
        selectedTargets = targets;
      },
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () => {
        transactions += 1;
        return createTransaction();
      }
    });

    expect(controller.handleNodeSelectionPointerDown(rect.id, pointerEvent({ clientX: 10, clientY: 12 }))).toBe(true);
    expect(selectedTargets).toEqual([nodeSelectionTarget(rect.id)]);
    expect(transactions).toBe(1);
    expect(activeDrag).toMatchObject({
      type: 'move-selection',
      pointerId: 1,
      selectedIds: [rect.id],
      startWorldX: 10,
      startWorldY: 12,
      committed: false
    });
  });

  it('updates and commits move-selection drags after movement threshold', () => {
    resetIdCounter();
    const baseRoot = createDefaultRoot();
    const root = appendChild(baseRoot, baseRoot.id, createDefaultElement('rect'));
    const rect = root.children[0];

    if (!rect) {
      throw new Error('Expected rect');
    }

    let activeDrag: ActiveDrag | undefined;
    let updates = 0;
    let commits = 0;
    let command: EditorCommand | undefined;
    const controller = createSelectionToolController({
      ...baseOptions(root),
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      selectedIds: () => [rect.id],
      beginCommandTransaction: () =>
        createTransaction({
          update: (nextCommand) => {
            updates += 1;
            command = nextCommand;
          },
          commit: () => {
            commits += 1;
          }
        })
    });

    controller.handleNodeSelectionPointerDown(rect.id, pointerEvent({ clientX: 0, clientY: 0 }));

    if (!activeDrag || activeDrag.type !== 'move-selection') {
      throw new Error('Expected move-selection drag');
    }

    controller.updateMoveSelectionDragFromEvent(activeDrag, pointerEvent({ clientX: 5, clientY: 0 }));

    expect(updates).toBe(1);
    expect(activeDrag).toMatchObject({ committed: true });
    expect(command?.id).toBe('svg.transform-selection');
    expect(command && isOperationBackedEditorCommand(command)).toBe(true);
    expect(command && isOperationBackedEditorCommand(command) ? command.resolveOperations(root) : []).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'transform', value: 'matrix(1 0 0 1 5 0)' }
    ]);

    const changedRect = requireElement(command?.apply(root), rect.id);

    expect(getAttribute(changedRect, 'transform', true)).toBe('matrix(1 0 0 1 5 0)');

    if (!activeDrag || activeDrag.type !== 'move-selection') {
      throw new Error('Expected move-selection drag');
    }

    controller.finishMoveSelectionDrag(activeDrag);

    expect(commits).toBe(1);
    expect(activeDrag).toBeUndefined();
  });

  it('cancels move-selection transactions that finish before the movement threshold', () => {
    resetIdCounter();
    const baseRoot = createDefaultRoot();
    const root = appendChild(baseRoot, baseRoot.id, createDefaultElement('rect'));
    const rect = root.children[0];

    if (!rect) {
      throw new Error('Expected rect');
    }

    let activeDrag: ActiveDrag | undefined;
    let cancels = 0;
    const controller = createSelectionToolController({
      ...baseOptions(root),
      selectedIds: () => [rect.id],
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () =>
        createTransaction({
          cancel: () => {
            cancels += 1;
          }
        })
    });

    controller.handleNodeSelectionPointerDown(rect.id, pointerEvent({ clientX: 0, clientY: 0 }));

    if (!activeDrag || activeDrag.type !== 'move-selection') {
      throw new Error('Expected move-selection drag');
    }

    controller.finishMoveSelectionDrag(activeDrag);

    expect(cancels).toBe(1);
    expect(activeDrag).toBeUndefined();
  });

  it('clears selection when a marquee drag finishes below click threshold', () => {
    const root = createDefaultRoot();
    let activeDrag: ActiveDrag | undefined;
    let marqueeRect: Rect | undefined;
    let cleared = 0;
    const controller = createSelectionToolController({
      ...baseOptions(root),
      clearSelection: () => {
        cleared += 1;
      },
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      setMarqueeRect: (next) => {
        marqueeRect = typeof next === 'function' ? next(marqueeRect) : next;
        return marqueeRect;
      }
    });

    controller.handleCanvasSelectionPointerDown(pointerEvent({ clientX: 2, clientY: 3 }));

    expect(activeDrag).toMatchObject({ type: 'marquee', startClientX: 2, startClientY: 3 });
    expect(marqueeRect).toEqual({ x: 2, y: 3, width: 0, height: 0 });

    controller.finishMarqueeDragFromEvent(activeDrag as ActiveMarqueeDrag, pointerEvent({ clientX: 3, clientY: 3 }));

    expect(cleared).toBe(1);
    expect(activeDrag).toBeUndefined();
    expect(marqueeRect).toBeUndefined();
  });

  it('uses typed renderer event targets for canvas selection', () => {
    const root = createDefaultRoot();
    const target = pathCommandSelectionTarget('path-1', 2);
    const hitElement = document.createElement('path');
    let selectedTarget: SelectionTarget | undefined;
    const controller = createSelectionToolController({
      ...baseOptions(root),
      selectTarget: (nextTarget) => {
        selectedTarget = nextTarget;
      },
      selectNode: () => {
        throw new Error('Expected typed target selection');
      },
      renderer: {
        ...emptyRenderer,
        selectionTargetFromEventTarget: (eventTarget) => (eventTarget === hitElement ? target : undefined)
      }
    });

    expect(controller.handleCanvasSelectionPointerDown(pointerEvent({ target: hitElement }))).toBe(true);
    expect(selectedTarget).toEqual(target);
  });

  it('uses the renderer adapter to resolve marquee selections', () => {
    const root = createDefaultRoot();
    let activeDrag: ActiveDrag | undefined;
    let selectedTargets: readonly SelectionTarget[] = [nodeSelectionTarget('existing')];
    let requestedRect: Rect | undefined;
    let requestedMode: string | undefined;
    const controller = createSelectionToolController({
      ...baseOptions(root),
      selectedIds: () => nodeIdsFromSelectionTargets(selectedTargets),
      selectedTargets: () => selectedTargets,
      setSelectedTargets: (targets) => {
        selectedTargets = targets;
      },
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      renderer: {
        ...emptyRenderer,
        hitTestMarqueeTargets: (rect, mode) => {
          requestedRect = rect;
          requestedMode = mode;
          return [nodeSelectionTarget('x2')];
        }
      }
    });

    controller.handleCanvasSelectionPointerDown(pointerEvent({ clientX: 10, clientY: 20, ctrlKey: true }));
    controller.finishMarqueeDragFromEvent(activeDrag as ActiveMarqueeDrag, pointerEvent({ clientX: 30, clientY: 55 }));

    expect(requestedRect).toEqual({ x: 10, y: 20, width: 20, height: 35 });
    expect(requestedMode).toBe('intersect');
    expect(selectedTargets).toEqual([nodeSelectionTarget('existing'), nodeSelectionTarget('x2')]);
    expect(activeDrag).toBeUndefined();
  });

  it('preserves typed renderer marquee targets', () => {
    const root = createDefaultRoot();
    const target = pathCommandSelectionTarget('path-1', 2);
    let activeDrag: ActiveDrag | undefined;
    let selectedTargets: readonly SelectionTarget[] = [];
    const controller = createSelectionToolController({
      ...baseOptions(root),
      setSelectedTargets: (targets) => {
        selectedTargets = targets;
      },
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      renderer: {
        ...emptyRenderer,
        hitTestMarqueeTargets: () => [target]
      }
    });

    controller.handleCanvasSelectionPointerDown(pointerEvent({ clientX: 10, clientY: 20 }));
    controller.finishMarqueeDragFromEvent(activeDrag as ActiveMarqueeDrag, pointerEvent({ clientX: 30, clientY: 55 }));

    expect(selectedTargets).toEqual([target]);
    expect(activeDrag).toBeUndefined();
  });

  it('falls back to the document spatial index for marquee selections', () => {
    const rect = createElementNode('rect', [
      { name: 'x', value: '108' },
      { name: 'y', value: '108' },
      { name: 'width', value: '4' },
      { name: 'height', value: '4' }
    ]);
    const root = createElementNode('svg', [], [rect]);
    const spatialIndex = createSvgSpatialIndex(root);
    let activeDrag: ActiveDrag | undefined;
    let selectedIds: readonly string[] = [];
    const controller = createSelectionToolController({
      ...baseOptions(root),
      selectedIds: () => selectedIds,
      setSelectedTargets: (targets) => {
        selectedIds = nodeIdsFromSelectionTargets(targets);
      },
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      clientToSvgPoint: (clientX, clientY): Point => ({ x: clientX + 100, y: clientY + 100 }),
      spatialIndex: () => spatialIndex
    });

    controller.handleCanvasSelectionPointerDown(pointerEvent({ clientX: 5, clientY: 5 }));
    controller.finishMarqueeDragFromEvent(activeDrag as ActiveMarqueeDrag, pointerEvent({ clientX: 15, clientY: 15 }));

    expect(selectedIds).toEqual([rect.id]);
    expect(activeDrag).toBeUndefined();
  });

  it('keeps renderer marquee results ahead of spatial-index fallback', () => {
    const spatialRect = createElementNode('rect', [
      { name: 'x', value: '0' },
      { name: 'y', value: '0' },
      { name: 'width', value: '100' },
      { name: 'height', value: '100' }
    ]);
    const root = createElementNode('svg', [], [spatialRect]);
    const spatialIndex = createSvgSpatialIndex(root);
    let activeDrag: ActiveDrag | undefined;
    let selectedIds: readonly string[] = [];
    const controller = createSelectionToolController({
      ...baseOptions(root),
      setSelectedTargets: (targets) => {
        selectedIds = nodeIdsFromSelectionTargets(targets);
      },
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      renderer: {
        ...emptyRenderer,
        hitTestMarqueeTargets: () => [nodeSelectionTarget('renderer-node')]
      },
      spatialIndex: () => spatialIndex
    });

    controller.handleCanvasSelectionPointerDown(pointerEvent({ clientX: 10, clientY: 10 }));
    controller.finishMarqueeDragFromEvent(activeDrag as ActiveMarqueeDrag, pointerEvent({ clientX: 30, clientY: 30 }));

    expect(selectedIds).toEqual(['renderer-node']);
  });
});

const emptyRenderer = {
  measureSelectionBox: () => undefined,
  hitTestMarqueeTargets: () => [],
  selectionTargetFromEventTarget: () => undefined,
  clientRectToViewportOverlay: (rect) => rect,
  viewportClientRect: () => undefined
} satisfies ViewportRendererAdapter;

function baseOptions(root: ReturnType<typeof createDefaultRoot>) {
  return {
    activeRoot: () => root,
    selectedIds: () => [],
    selectedTargets: () => [],
    setSelectedTargets: () => undefined,
    selectTarget: () => undefined,
    selectNode: () => undefined,
    clearSelection: () => undefined,
    clearContextMenu: () => undefined,
    setActiveDrag: () => undefined,
    setMarqueeRect: () => undefined,
    clientToSvgPoint: (clientX: number, clientY: number): Point => ({ x: clientX, y: clientY }),
    dragSelectionMode: () => 'intersect' as const,
    renderer: emptyRenderer,
    beginCommandTransaction: () => createTransaction()
  };
}

function createTransaction(overrides: Partial<Pick<CommandTransaction, 'update' | 'commit' | 'cancel'>> = {}): CommandTransaction {
  return {
    tabId: 'test-tab',
    changed: () => false,
    update: () => undefined,
    commit: () => undefined,
    cancel: () => undefined,
    ...overrides
  };
}

function requireElement(root: SvgElementNode | undefined, id: string): SvgElementNode {
  if (!root) {
    throw new Error('Expected root');
  }

  const node = findNode(root, id);

  if (!node || node.kind !== 'element') {
    throw new Error(`Expected element ${id}`);
  }

  return node;
}

function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    currentTarget: document.createElement('div'),
    metaKey: false,
    pointerId: 1,
    preventDefault: () => undefined,
    shiftKey: false,
    target: null,
    ...overrides
  } as PointerEvent;
}
