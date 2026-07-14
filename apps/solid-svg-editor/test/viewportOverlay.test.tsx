import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import type { ViewportOverlayContribution, ViewportOverlayService } from '../src/editor/kernel';
import { ViewportOverlayLayer } from '../src/features/viewport/ViewportParts';

interface TestOverlayContext {
  readonly label: string;
}

describe('viewport overlay contributions', () => {
  it('renders contributed overlays by placement and order', () => {
    const items = [
      {
        id: 'test.html',
        placement: 'html',
        order: 10,
        render: ({ context, overlays }) => (
          <div data-testid="test-html-overlay">{context.label} html {overlays.zoom()}</div>
        )
      },
      {
        id: 'test.svg-late',
        placement: 'svg-world',
        order: 20,
        render: ({ context, overlays }) => (
          <text data-testid="test-svg-late">{context.label} late {overlays.zoom()}</text>
        )
      },
      {
        id: 'test.svg-early',
        placement: 'svg-world',
        order: 10,
        render: ({ context, overlays }) => (
          <text data-testid="test-svg-early">{context.label} early {overlays.zoom()}</text>
        )
      }
    ] satisfies readonly ViewportOverlayContribution<TestOverlayContext>[];
    const overlays = createTestOverlayService();
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => (
        <>
          <svg>
            <g data-testid="svg-overlay-host">
              <ViewportOverlayLayer
                items={items}
                context={{ label: 'Injected' }}
                overlays={overlays}
                placement="svg-world"
              />
            </g>
          </svg>
          <div data-testid="html-overlay-host">
            <ViewportOverlayLayer
              items={items}
              context={{ label: 'Injected' }}
              overlays={overlays}
              placement="html"
            />
          </div>
        </>
      ),
      container
    );

    expect(testIds(requiredElement(container, 'svg-overlay-host'))).toEqual([
      'test-svg-early',
      'test-svg-late'
    ]);
    expect(requiredElement(container, 'test-svg-early').textContent).toBe('Injected early 2');
    expect(requiredElement(container, 'test-html-overlay').textContent).toBe('Injected html 2');

    dispose();
    container.remove();
  });
});

function createTestOverlayService(): ViewportOverlayService {
  return {
    zoom: () => 2,
    handles: () => [],
    selectionBox: () => undefined,
    marqueeRect: () => undefined,
    startHandleDrag: () => undefined,
    startTransformBoxDrag: () => undefined
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
