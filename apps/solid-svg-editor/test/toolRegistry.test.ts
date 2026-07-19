import { describe, expect, it } from 'vitest';

import {
  createViewportToolRegistry,
  type ViewportTool
} from '../src/features/viewport/tools/toolRegistry';

describe('createViewportToolRegistry', () => {
  it('runs higher priority tools first and stops after a handled canvas pointer event', () => {
    const calls: string[] = [];
    const lowerPriorityTool = {
      id: 'test.lower',
      label: 'Lower priority',
      priority: 1,
      onCanvasPointerDown: () => {
        calls.push('lower');
        return true;
      }
    } satisfies ViewportTool;
    const higherPriorityTool = {
      id: 'test.higher',
      label: 'Higher priority',
      priority: 10,
      onCanvasPointerDown: () => {
        calls.push('higher');
        return true;
      }
    } satisfies ViewportTool;

    const registry = createViewportToolRegistry([lowerPriorityTool, higherPriorityTool]);

    expect(registry.tools.map((tool) => tool.id)).toEqual(['test.higher', 'test.lower']);
    expect(registry.handleCanvasPointerDown({} as PointerEvent)).toBe(true);
    expect(calls).toEqual(['higher']);
  });

  it('falls through when a tool declines a window pointer event', () => {
    const calls: string[] = [];
    const registry = createViewportToolRegistry([
      {
        id: 'test.first',
        label: 'First',
        priority: 2,
        onWindowPointerMove: () => {
          calls.push('first');
          return false;
        }
      },
      {
        id: 'test.second',
        label: 'Second',
        priority: 1,
        onWindowPointerMove: () => {
          calls.push('second');
          return true;
        }
      }
    ] satisfies readonly ViewportTool[]);

    expect(registry.handleWindowPointerMove({} as PointerEvent)).toBe(true);
    expect(calls).toEqual(['first', 'second']);
  });

  it('returns false when no registered tool handles the event', () => {
    const registry = createViewportToolRegistry([
      {
        id: 'test.idle',
        label: 'Idle',
        priority: 1
      }
    ] satisfies readonly ViewportTool[]);

    expect(registry.handleCanvasWheel({} as WheelEvent)).toBe(false);
  });
});
