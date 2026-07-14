import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { EditorContextMenu } from '../src/features/selection/EditorContextMenu';
import { createEditorAppController } from '../src/features/shell/createEditorAppController';
import type { EditorAppContribution } from '../src/features/shell/editorAppContributions';

describe('EditorContextMenu', () => {
  it('renders and closes the active kernel context menu', () => {
    let runs = 0;
    const extension = {
      id: 'test.context-menu-ui',
      contextMenus: [
        {
          id: 'test.magic',
          label: 'Magic context action',
          order: -100,
          run: () => {
            runs += 1;
          }
        }
      ]
    } satisfies EditorAppContribution;
    const container = document.createElement('div');
    document.body.append(container);

    createRoot((disposeRoot) => {
      const app = createEditorAppController({ contributions: [extension] });
      const contextMenu = app.kernel.ui.contextMenu;

      if (!contextMenu) {
        throw new Error('Expected context menu UI service');
      }

      contextMenu.open(new MouseEvent('contextmenu', { clientX: 12, clientY: 34 }), app.kernel.documents.activeRoot().id);

      const disposeRender = render(() => <EditorContextMenu kernel={app.kernel} />, container);
      const menu = requireElement(container, 'context-menu');
      const item = requireElement(container, 'context-menu-test.magic');

      expect(menu.style.left).toBe('12px');
      expect(menu.style.top).toBe('34px');
      expect(item.textContent).toContain('Magic context action');

      item.click();

      expect(runs).toBe(1);
      expect(contextMenu.active()).toBeUndefined();

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
