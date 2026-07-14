import { describe, expect, it } from 'vitest';

import type { CommandTransaction, EditorCommand } from '../src/editor/commands';
import type { Point } from '../src/editor/geometry';
import { pathAnchorSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import type { ActiveDrag, ActiveHandleDrag, HandleDescriptor } from '../src/editor/types';
import { createDefaultRoot, getAttribute, setAttribute, type SvgElementNode } from '../src/svg-model';
import { createElementHandleToolController } from '../src/features/viewport/tools/elementHandleToolController';

describe('createElementHandleToolController', () => {
  it('begins handle drags through an explicit transaction', () => {
    const handle = createHandle();
    let activeDrag: ActiveDrag | undefined;
    let transactions = 0;
    const controller = createElementHandleToolController({
      ...baseOptions(),
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () => {
        transactions += 1;
        return createTransaction();
      }
    });

    expect(controller.beginElementHandleDrag(pointerEvent({ pointerId: 12 }), handle)).toBe(true);

    expect(transactions).toBe(1);
    expect(activeDrag).toMatchObject({ type: 'handle', pointerId: 12, handle });
  });

  it('selects a handle selection target before beginning a drag', () => {
    const target = pathAnchorSelectionTarget('x2', 1, 'x');
    const handle = { ...createHandle(), selectionTargets: [target] } satisfies HandleDescriptor;
    const selectedTargets: SelectionTarget[] = [];
    let transactions = 0;
    const controller = createElementHandleToolController({
      ...baseOptions(),
      selectTarget: (nextTarget) => {
        selectedTargets.push(nextTarget);
      },
      beginCommandTransaction: () => {
        transactions += 1;
        return createTransaction();
      }
    });

    expect(controller.beginElementHandleDrag(pointerEvent({ pointerId: 12 }), handle)).toBe(true);

    expect(selectedTargets).toEqual([target]);
    expect(transactions).toBe(1);
  });

  it('does not select handle targets for ignored pointer buttons', () => {
    const target = pathAnchorSelectionTarget('x2', 1, 'x');
    const handle = { ...createHandle(), selectionTargets: [target] } satisfies HandleDescriptor;
    const selectedTargets: SelectionTarget[] = [];
    const controller = createElementHandleToolController({
      ...baseOptions(),
      selectTarget: (nextTarget) => {
        selectedTargets.push(nextTarget);
      }
    });

    expect(controller.beginElementHandleDrag(pointerEvent({ button: 1 }), handle)).toBe(false);

    expect(selectedTargets).toEqual([]);
  });

  it('flushes the latest queued handle update when finishing', () => {
    const handle = createHandle();
    let activeDrag: ActiveDrag | undefined = {
      type: 'handle',
      pointerId: 7,
      handle
    };
    let command: EditorCommand | undefined;
    let commits = 0;
    const controller = createElementHandleToolController({
      ...baseOptions(),
      activeDrag: () => activeDrag,
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      clientToSvgPoint: (clientX, clientY): Point => ({ x: clientX + 100, y: clientY + 200 }),
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

    controller.beginElementHandleDrag(pointerEvent({ pointerId: 7 }), handle);
    controller.updateElementHandleDrag(activeDrag as ActiveHandleDrag, pointerEvent({ pointerId: 7, clientX: 1, clientY: 2 }));
    controller.updateElementHandleDrag(activeDrag as ActiveHandleDrag, pointerEvent({ pointerId: 7, clientX: 6, clientY: 10 }));
    controller.finishElementHandleDrag();

    expect(command?.id).toBe('viewport.drag-handle');
    expect(command?.label).toBe('Drag test handle');
    expect(command?.durability).toEqual({
      kind: 'legacy',
      reason: 'Legacy SVG handle descriptors expose update closures instead of operation-backed createCommand factories.'
    });
    expect(commits).toBe(1);
    expect(activeDrag).toBeUndefined();

    const changed = requireCommand(command).apply(createDefaultRoot());

    expect(getAttribute(changed, 'data-point', true)).toBe('106,210');
  });

  it('uses handle command factories for queued drag updates', () => {
    const handle = {
      commandMode: 'command',
      id: 'handle',
      nodeId: 'x2',
      x: 0,
      y: 0,
      label: 'test handle',
      small: false,
      createCommand: (x, y) => ({
        id: 'test.drag-handle',
        label: 'Factory drag',
        apply: (root) => setAttribute(root, 'data-command-point', `${x},${y}`)
      })
    } satisfies HandleDescriptor;
    let activeDrag: ActiveDrag | undefined = {
      type: 'handle',
      pointerId: 7,
      handle
    };
    let command: EditorCommand | undefined;
    const controller = createElementHandleToolController({
      ...baseOptions(),
      activeDrag: () => activeDrag,
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      clientToSvgPoint: (clientX, clientY): Point => ({ x: clientX + 100, y: clientY + 200 }),
      beginCommandTransaction: () =>
        createTransaction({
          update: (nextCommand) => {
            command = nextCommand;
          }
        })
    });

    controller.beginElementHandleDrag(pointerEvent({ pointerId: 7 }), handle);
    controller.updateElementHandleDrag(activeDrag as ActiveHandleDrag, pointerEvent({ pointerId: 7, clientX: 6, clientY: 10 }));
    controller.finishElementHandleDrag();

    expect(command?.id).toBe('test.drag-handle');
    expect(command?.label).toBe('Factory drag');

    const changed = requireCommand(command).apply(createDefaultRoot());

    expect(getAttribute(changed, 'data-command-point', true)).toBe('106,210');
    expect(getAttribute(changed, 'data-point', true)).toBe('');
  });

  it('drops queued handle updates when canceled before finish', () => {
    const handle = createHandle();
    let activeDrag: ActiveDrag | undefined = {
      type: 'handle',
      pointerId: 7,
      handle
    };
    let command: EditorCommand | undefined;
    const controller = createElementHandleToolController({
      ...baseOptions(),
      activeDrag: () => activeDrag,
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      beginCommandTransaction: () =>
        createTransaction({
          update: (nextCommand) => {
            command = nextCommand;
          }
        })
    });

    controller.beginElementHandleDrag(pointerEvent({ pointerId: 7 }), handle);
    controller.updateElementHandleDrag(activeDrag as ActiveHandleDrag, pointerEvent({ pointerId: 7, clientX: 1, clientY: 2 }));
    controller.cancelPendingHandleDragUpdate();
    controller.finishElementHandleDrag();

    expect(command).toBeUndefined();
  });
});

function baseOptions() {
  return {
    activeDrag: () => undefined,
    setActiveDrag: () => undefined,
    selectTarget: () => undefined,
    clientToSvgPoint: (clientX: number, clientY: number): Point => ({ x: clientX, y: clientY }),
    beginCommandTransaction: () => createTransaction()
  };
}

function createHandle(): HandleDescriptor {
  return {
    id: 'handle',
    nodeId: 'x2',
    x: 0,
    y: 0,
    label: 'test handle',
    small: false,
    update: (root: SvgElementNode, x: number, y: number) => setAttribute(root, 'data-point', `${x},${y}`)
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
