import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import type { ViewportToolbarContribution } from '../src/editor/kernel';
import { ViewportToolbar } from '../src/features/viewport/ViewportParts';

interface TestToolbarContext {
  readonly label: string;
}

describe('viewport toolbar contributions', () => {
  it('renders contributed controls by placement and order', () => {
    const items = [
      {
        id: 'test.right',
        placement: 'right',
        order: 20,
        render: (context) => <button type="button">{context.label} right</button>
      },
      {
        id: 'test.left-late',
        placement: 'left',
        order: 20,
        render: (context) => <button type="button">{context.label} late</button>
      },
      {
        id: 'test.left-early',
        placement: 'left',
        order: 10,
        render: (context) => <button type="button">{context.label} early</button>
      }
    ] satisfies readonly ViewportToolbarContribution<TestToolbarContext>[];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(
      () => <ViewportToolbar items={items} context={{ label: 'Injected' }} />,
      container
    );

    expect(buttonLabels(requiredElement(container, 'viewport-left-tools'))).toEqual([
      'Injected early',
      'Injected late'
    ]);
    expect(buttonLabels(requiredElement(container, 'zoom-widget'))).toEqual(['Injected right']);

    dispose();
    container.remove();
  });
});

function requiredElement(container: ParentNode, testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  if (!element) {
    throw new Error(`Expected element with test id "${testId}"`);
  }

  return element;
}

function buttonLabels(element: ParentNode): readonly string[] {
  return [...element.querySelectorAll('button')].map((button) => button.textContent ?? '');
}
