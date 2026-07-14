import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import type { SvgImportService } from '../src/editor/kernel';
import { SvgDropOverlay } from '../src/features/import/SvgDropOverlay';
import { createEditorAppController } from '../src/features/shell/createEditorAppController';

describe('SvgDropOverlay', () => {
  it('renders from kernel SVG import drop state', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    let svgImport: SvgImportService | undefined;
    let disposeRender: (() => void) | undefined;
    let disposeRoot: (() => void) | undefined;

    createRoot((dispose) => {
      const app = createEditorAppController();
      svgImport = app.kernel.ui.svgImport;
      disposeRoot = dispose;

      if (!svgImport) {
        throw new Error('Expected SVG import UI service');
      }

      disposeRender = render(() => <SvgDropOverlay kernel={app.kernel} />, container);
    });

    expect(queryElement(container, 'svg-drop-overlay')).toBeNull();

    svgImport?.onDragEnter(createDragEvent('dragenter'));
    await Promise.resolve();

    expect(requireElement(container, 'svg-drop-overlay').textContent).toContain('Drop SVG to import');

    svgImport?.onDragLeave(createDragEvent('dragleave'));
    await Promise.resolve();

    expect(queryElement(container, 'svg-drop-overlay')).toBeNull();

    disposeRender?.();
    disposeRoot?.();
    container.remove();
  });
});

function createDragEvent(type: string): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;

  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: ['text/plain'],
      files: [],
      getData: () => '<svg />'
    }
  });

  return event;
}

function queryElement(container: HTMLElement, testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function requireElement(container: HTMLElement, testId: string): HTMLElement {
  const element = queryElement(container, testId);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element with test id ${testId}`);
  }

  return element;
}
