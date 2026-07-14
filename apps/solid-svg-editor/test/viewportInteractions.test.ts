import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import type { Point, Rect } from '../src/editor/geometry';
import { nodeSelectionTarget, pathCommandSelectionTarget, type SelectionTarget } from '../src/editor/selection-targets';
import { createEditorAppRegistries } from '../src/features/shell/editorAppContributions';
import { createViewportInteractions } from '../src/features/viewport/createViewportInteractions';
import type { ViewportRendererAdapter } from '../src/features/viewport/rendererAdapter';
import type { ViewportToolRegistryContribution } from '../src/features/viewport/tools/defaultViewportTools';
import { createElementNode, type SvgElementNode } from '../src/svg-model';

describe('createViewportInteractions', () => {
  it('installs app viewport tool contributions into the live event runtime', () => {
    createRoot((dispose) => {
      let pointerDowns = 0;
      const extension = {
        id: 'test.viewport-tools',
        tools: [
          {
            id: 'test.canvas-pointer',
            label: 'Test canvas pointer',
            priority: 200,
            createTool: () => ({
              id: 'test.canvas-pointer',
              label: 'Test canvas pointer',
              priority: 200,
              onCanvasPointerDown: (event) => {
                pointerDowns += 1;
                event.preventDefault();
                return true;
              }
            })
          }
        ]
      } satisfies ViewportToolRegistryContribution;
      const interactions = createViewportInteractions({
        ...createInteractionOptions(createElementNode('svg')),
        toolContributions: createEditorAppRegistries([extension]).tools
      });
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 20,
        pointerId: 7
      });

      interactions.onCanvasPointerDown(event);

      expect(pointerDowns).toBe(1);
      expect(event.defaultPrevented).toBe(true);
      dispose();
    });
  });

  it('passes typed selection targets into renderer selection-box measurement', async () => {
    const root = createElementNode('svg');
    const target = nodeSelectionTarget('x2');
    let dispose: (() => void) | undefined;
    let measuredTargets: readonly SelectionTarget[] | undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      createViewportInteractions({
        ...createInteractionOptions(root),
        selectedIds: () => ['x2'],
        selectedTargets: () => [target],
        renderer: {
          ...emptyRenderer,
          measureSelectionBox: (request) => {
            measuredTargets = request.selectedTargets;
            return undefined;
          }
        }
      });
    });

    await nextAnimationFrame();

    expect(measuredTargets).toEqual([target]);
    dispose?.();
  });

  it('routes typed selection-target pointer down through installed viewport tools', () => {
    createRoot((dispose) => {
      const target = pathCommandSelectionTarget('path-1', 2);
      let receivedTarget: SelectionTarget | undefined;
      const extension = {
        id: 'test.target-tools',
        tools: [
          {
            id: 'test.target-pointer',
            label: 'Test target pointer',
            priority: 200,
            createTool: () => ({
              id: 'test.target-pointer',
              label: 'Test target pointer',
              priority: 200,
              onSelectionTargetPointerDown: (nextTarget) => {
                receivedTarget = nextTarget;
                return true;
              }
            })
          }
        ]
      } satisfies ViewportToolRegistryContribution;
      const interactions = createViewportInteractions({
        ...createInteractionOptions(createElementNode('svg')),
        toolContributions: createEditorAppRegistries([extension]).tools
      });

      interactions.onSelectionTargetPointerDown(target, new PointerEvent('pointerdown', { pointerId: 7 }));

      expect(receivedTarget).toEqual(target);
      dispose();
    });
  });
});

function createInteractionOptions(root: SvgElementNode): Parameters<typeof createViewportInteractions>[0] {
  return {
    activeRoot: () => root,
    selectedIds: () => [],
    selectedTargets: () => [],
    setSelectedTargets: (_targets: readonly SelectionTarget[]) => undefined,
    selectTarget: () => undefined,
    selectNode: () => undefined,
    clearSelection: () => undefined,
    setContextMenu: () => undefined,
    beginCommandTransaction: () => undefined,
    cancelCommandTransaction: () => undefined,
    renderer: emptyRenderer,
    zoom: () => 1,
    setZoom: () => 1,
    viewportSize: () => ({ width: 800, height: 600 }),
    viewportRotation: () => 0,
    setViewportRotation: () => 0,
    setCameraCenter: () => ({ x: 0, y: 0 }),
    clientToSvgPoint: (clientX, clientY): Point => ({ x: clientX, y: clientY }),
    centerForClientPoint: (worldPoint): Point => worldPoint,
    angleFromViewportCenter: () => 0,
    zoomBy: () => undefined,
    rotateViewportBy: () => undefined,
    dragSelectionMode: () => 'contain',
    useCtrlForZoom: () => false,
    useRasterPreview: () => false,
    keepViewportPreviewAlive: () => undefined
  };
}

const emptyRenderer = {
  measureSelectionBox: () => undefined,
  hitTestMarqueeTargets: () => [],
  selectionTargetFromEventTarget: () => undefined,
  clientRectToViewportOverlay: (rect: Rect) => rect,
  viewportClientRect: () => undefined
} satisfies ViewportRendererAdapter;

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
