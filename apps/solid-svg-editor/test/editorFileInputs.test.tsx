import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { EditorFileInputs } from '../src/features/shell/EditorFileInputs';
import { createEditorAppController } from '../src/features/shell/createEditorAppController';

describe('EditorFileInputs', () => {
  it('renders hidden file inputs from kernel UI services', () => {
    const container = document.createElement('div');
    document.body.append(container);

    createRoot((disposeRoot) => {
      const app = createEditorAppController();
      const disposeRender = render(() => <EditorFileInputs kernel={app.kernel} />, container);

      const importInput = requireElement(container, 'svg-import-input');
      const referenceInput = requireElement(container, 'reference-import-input');

      expect(importInput.getAttribute('accept')).toBe('.svg,image/svg+xml,text/xml');
      expect(referenceInput.getAttribute('accept')).toBe('image/*');

      disposeRender();
      disposeRoot();
    });

    container.remove();
  });
});

function requireElement(container: HTMLElement, testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element with test id ${testId}`);
  }

  return element;
}
