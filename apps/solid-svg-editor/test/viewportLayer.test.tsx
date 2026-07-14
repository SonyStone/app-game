import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../src/editor/defaults';
import type { ViewportLayerContribution, ViewportLayerService } from '../src/editor/kernel';
import { nodeSelectionTarget } from '../src/editor/selection-targets';
import { ViewportLayerStack } from '../src/features/viewport/ViewportParts';
import { createElementNode } from '../src/svg-model';

interface TestLayerContext {
  readonly label: string;
}

describe('viewport layer contributions', () => {
  it('renders contributed scene layers by placement and order', () => {
    const items = [
      {
        id: 'test.world-late',
        placement: 'svg-world',
        order: 20,
        render: ({ context, layers }) => (
          <text data-testid="test-world-late">{context.label} world late {layers.zoom()}</text>
        )
      },
      {
        id: 'test.viewport',
        placement: 'svg-viewport',
        order: 10,
        render: ({ context, layers }) => (
          <rect
            data-testid="test-viewport-layer"
            x={layers.viewRect().x}
            y={layers.viewRect().y}
            width={layers.viewRect().width}
            height={layers.viewRect().height}
          >
            <title>{context.label} viewport</title>
          </rect>
        )
      },
      {
        id: 'test.world-early',
        placement: 'svg-world',
        order: 10,
        render: ({ context, layers }) => (
          <text data-testid="test-world-early">{context.label} world early {layers.zoom()} targets {layers.selectedTargets().length}</text>
        )
      }
    ] satisfies readonly ViewportLayerContribution<TestLayerContext>[];
    const layers = createTestLayerService();
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <svg>
          <g data-testid="viewport-layer-host">
            <ViewportLayerStack
              items={items}
              context={{ label: 'Injected' }}
              layers={layers}
              placement="svg-viewport"
            />
          </g>
          <g data-testid="world-layer-host">
            <ViewportLayerStack
              items={items}
              context={{ label: 'Injected' }}
              layers={layers}
              placement="svg-world"
            />
          </g>
        </svg>
      ),
      container
    );

    expect(testIds(requiredElement(container, 'viewport-layer-host'))).toEqual(['test-viewport-layer']);
    expect(testIds(requiredElement(container, 'world-layer-host'))).toEqual([
      'test-world-early',
      'test-world-late'
    ]);
    expect(requiredElement(container, 'test-world-early').textContent).toBe('Injected world early 2 targets 1');

    dispose();
    container.remove();
  });
});

function createTestLayerService(): ViewportLayerService {
  const root = createElementNode('svg');

  return {
    settings: () => defaultSettings(),
    zoom: () => 2,
    viewRect: () => ({ x: 1, y: 2, width: 100, height: 200 }),
    gridViewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    rootSize: () => ({ width: 100, height: 100, viewBox: [0, 0, 100, 100] }),
    root: () => root,
    selectedIds: () => [],
    selectedTargets: () => [nodeSelectionTarget(root.id)],
    viewportIsMoving: () => false,
    referenceImage: () => undefined,
    showReference: () => false,
    overlayReference: () => false,
    useRasterPreview: () => false,
    rasterPreviewUrl: () => undefined,
    rasterPreviewRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    nodeRenderer: () => undefined,
    onNodePointerDown: () => undefined,
    onSelectionTargetPointerDown: () => undefined,
    openContextMenu: () => undefined,
    openSelectionTargetContextMenu: () => undefined
  };
}

function requiredElement(container: ParentNode, testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected element with test id "${testId}"`);
  }

  return element;
}

function testIds(element: ParentNode): readonly string[] {
  return [...element.querySelectorAll('[data-testid]')]
    .map((node) => node.getAttribute('data-testid'))
    .filter((testId): testId is string => Boolean(testId));
}
