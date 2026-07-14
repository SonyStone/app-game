import { describe, expect, it } from 'vitest';

import type { ActiveMoveSelectionDrag } from '../src/editor/types';
import {
  coreViewportToolContribution,
  createDefaultViewportTools,
  createViewportToolsFromContributions,
  type DefaultViewportToolContext
} from '../src/features/viewport/tools/defaultViewportTools';
import { createViewportToolRegistry } from '../src/features/viewport/tools/toolRegistry';

describe('createDefaultViewportTools', () => {
  it('installs the built-in viewport tools through a core contribution', () => {
    expect(coreViewportToolContribution.id).toBe('core.viewport-tools');
    expect(coreViewportToolContribution.tools.map((tool) => tool.id)).toEqual([
      'touch',
      'view-navigation',
      'element-handle',
      'transform-box',
      'selection'
    ]);
  });

  it('composes the built-in tools with stable ids and priority order', () => {
    const registry = createViewportToolRegistry(createDefaultViewportTools(createToolContext()));

    expect(registry.tools.map((tool) => tool.id)).toEqual([
      'touch',
      'view-navigation',
      'element-handle',
      'transform-box',
      'selection'
    ]);
  });

  it('creates tools from custom viewport tool contributions', () => {
    const registry = createViewportToolRegistry(
      createViewportToolsFromContributions(createToolContext(), [
        coreViewportToolContribution,
        {
          id: 'test.viewport-tools',
          tools: [
            {
              id: 'test-tool',
              label: 'Test tool',
              priority: 95,
              createTool: () => ({
                id: 'test-tool',
                label: 'Test tool',
                priority: 95,
                onCanvasWheel: () => true
              })
            }
          ]
        }
      ])
    );

    expect(registry.tools.map((tool) => tool.id)).toEqual([
      'touch',
      'test-tool',
      'view-navigation',
      'element-handle',
      'transform-box',
      'selection'
    ]);
    expect(registry.handleCanvasWheel(new WheelEvent('wheel'))).toBe(true);
  });

  it('routes selection pointer cancel through the active-drag cancel path', () => {
    let canceled = 0;
    const context = createToolContext({
      activeDrag: () =>
        ({
          type: 'move-selection',
          pointerId: 12,
          selectedIds: ['x2'],
          startClientX: 0,
          startClientY: 0,
          startWorldX: 0,
          startWorldY: 0,
          committed: true
        }) satisfies ActiveMoveSelectionDrag,
      cancelActiveDrag: () => {
        canceled += 1;
      }
    });
    const registry = createViewportToolRegistry(createDefaultViewportTools(context));

    expect(registry.handleWindowPointerCancel({ pointerId: 12 } as PointerEvent)).toBe(true);
    expect(canceled).toBe(1);
  });
});

function createToolContext(overrides: Partial<DefaultViewportToolContext> = {}): DefaultViewportToolContext {
  return {
    activeDrag: () => undefined,
    clearContextMenu: () => undefined,
    handleViewportWheel: () => false,
    hasTouchPoint: () => false,
    beginTouchPoint: () => undefined,
    updateTouchPoint: () => undefined,
    finishTouchPoint: () => undefined,
    beginPanDrag: () => undefined,
    updatePanDrag: () => undefined,
    finishPanDrag: () => undefined,
    beginCanvasRotateDrag: () => undefined,
    updateCanvasRotateDrag: () => undefined,
    finishCanvasRotateDrag: () => undefined,
    handleCanvasSelectionPointerDown: () => false,
    handleNodeSelectionPointerDown: () => false,
    handleSelectionTargetPointerDown: () => false,
    updateMarqueeDrag: () => undefined,
    finishMarqueeDrag: () => undefined,
    updateMoveSelectionDrag: () => undefined,
    finishMoveSelectionDrag: () => undefined,
    beginElementHandleDrag: () => false,
    updateElementHandleDrag: () => undefined,
    finishElementHandleDrag: () => undefined,
    beginTransformBoxDrag: () => false,
    updateTransformBoxDrag: () => undefined,
    finishTransformBoxDrag: () => undefined,
    cancelActiveDrag: () => undefined,
    ...overrides
  };
}
