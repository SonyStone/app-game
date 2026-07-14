import { describe, expect, it } from 'vitest';

import type { CommandTransaction, EditorCommand } from '../src/editor/commands';
import type { Point, Rect } from '../src/editor/geometry';
import { isOperationBackedEditorCommand } from '../src/editor/operations';
import type { ActiveDrag, ActiveTransformBoxDrag, TransformBoxHandleDescriptor } from '../src/editor/types';
import {
  appendChild,
  createDefaultElement,
  createDefaultRoot,
  findNode,
  getAttribute,
  resetIdCounter,
  type SvgElementNode
} from '../src/svg-model';
import { createTransformBoxToolController } from '../src/features/viewport/tools/transformBoxToolController';

describe('createTransformBoxToolController', () => {
  it('begins transform-box drags from the measured selection box', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const tree = appendChild(root, root.id, rect);
    let activeDrag: ActiveDrag | undefined;
    let transactions = 0;
    const controller = createTransformBoxToolController({
      ...baseOptions(tree),
      selectedIds: () => [rect.id],
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () => {
        transactions += 1;
        return createTransaction();
      }
    });

    expect(controller.beginTransformBoxDrag(pointerEvent({ pointerId: 15, clientX: 20, clientY: 5 }), transformHandle('e'))).toBe(true);

    expect(transactions).toBe(1);
    expect(activeDrag).toMatchObject({
      type: 'transform-box',
      pointerId: 15,
      handleKind: 'e',
      selectedIds: [rect.id],
      startBox: { x: 0, y: 0, width: 10, height: 10 },
      startAngle: 0
    });
  });

  it('ignores transform-box drags without a selectable measured box', () => {
    const root = createDefaultRoot();
    let activeDrag: ActiveDrag | undefined;
    let transactions = 0;
    const controller = createTransformBoxToolController({
      ...baseOptions(root),
      selectionBox: () => undefined,
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () => {
        transactions += 1;
        return createTransaction();
      }
    });

    expect(controller.beginTransformBoxDrag(pointerEvent(), transformHandle('e'))).toBe(false);
    expect(transactions).toBe(0);
    expect(activeDrag).toBeUndefined();
  });

  it('emits transform-selection commands and commits on finish', () => {
    resetIdCounter();
    const root = createDefaultRoot();
    const rect = createDefaultElement('rect');
    const tree = appendChild(root, root.id, rect);
    let activeDrag: ActiveDrag | undefined;
    let command: EditorCommand | undefined;
    let commits = 0;
    const controller = createTransformBoxToolController({
      ...baseOptions(tree),
      selectedIds: () => [rect.id],
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () =>
        createTransaction({
          update: (nextCommand) => {
            command = nextCommand;
          },
          commit: () => {
            commits += 1;
          }
        })
    });

    controller.beginTransformBoxDrag(pointerEvent({ clientX: 5, clientY: 5 }), transformHandle('e'));

    if (!activeDrag || activeDrag.type !== 'transform-box') {
      throw new Error('Expected transform-box drag');
    }

    controller.updateTransformBoxDragFromEvent(activeDrag as ActiveTransformBoxDrag, pointerEvent({ clientX: 20, clientY: 5 }));

    expect(command?.id).toBe('svg.transform-selection');
    expect(command?.label).toBe('Transform selection');
    expect(command && isOperationBackedEditorCommand(command)).toBe(true);
    expect(command && isOperationBackedEditorCommand(command) ? command.resolveOperations(tree) : []).toEqual([
      { kind: 'svg.set-attribute', nodeId: rect.id, name: 'transform', value: 'matrix(2 0 0 1 0 0)' }
    ]);

    const changed = requireCommand(command).apply(tree);
    const changedRect = requireElement(changed, rect.id);

    expect(getAttribute(changedRect, 'transform', true)).toBe('matrix(2 0 0 1 0 0)');

    controller.finishTransformBoxDrag();

    expect(commits).toBe(1);
    expect(activeDrag).toBeUndefined();
  });
});

function baseOptions(root: SvgElementNode) {
  return {
    activeRoot: () => root,
    selectedIds: () => [],
    selectionBox: (): Rect | undefined => ({ x: 0, y: 0, width: 10, height: 10 }),
    setActiveDrag: () => undefined,
    clientToSvgPoint: (clientX: number, clientY: number): Point => ({ x: clientX, y: clientY }),
    beginCommandTransaction: () => createTransaction()
  };
}

function transformHandle(kind: TransformBoxHandleDescriptor['kind']): TransformBoxHandleDescriptor {
  return {
    kind,
    x: 0,
    y: 0,
    label: kind
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

function requireCommand(command: EditorCommand | undefined): EditorCommand {
  if (!command) {
    throw new Error('Expected command');
  }

  return command;
}

function requireElement(root: SvgElementNode, id: string): SvgElementNode {
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
    currentTarget: document.createElement('div'),
    pointerId: 1,
    pointerType: 'mouse',
    stopPropagation: () => undefined,
    ...overrides
  } as PointerEvent;
}
