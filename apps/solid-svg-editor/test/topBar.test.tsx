import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { topBarMenuSlots } from '../src/editor/app-menu';
import { TopBar } from '../src/features/chrome/TopBar';
import { createEditorAppController } from '../src/features/shell/createEditorAppController';
import type { EditorAppContribution } from '../src/features/shell/editorAppContributions';

describe('TopBar', () => {
  it('renders contributed top bar menu items', () => {
    let runs = 0;
    const container = document.createElement('div');
    document.body.append(container);
    createRoot((disposeRoot) => {
      const extension = {
        id: 'test.topbar',
        actions: [
          {
            id: 'test.magic-toolbar',
            label: 'Magic toolbar action',
            run: () => {
              runs += 1;
            }
          }
        ],
        appMenus: [
          {
            kind: 'action',
            id: 'test.magic-toolbar',
            slot: topBarMenuSlots.file,
            actionId: 'test.magic-toolbar',
            label: 'Magic',
            presentation: 'text-button',
            testId: 'topbar-test-magic'
          }
        ]
      } satisfies EditorAppContribution;
      const app = createEditorAppController({ contributions: [extension] });
      const disposeRender = render(() => <TopBar kernel={app.kernel} />, container);

      const button = requireElement(container, 'topbar-test-magic');

      expect(button.textContent).toContain('Magic');
      button.click();
      expect(runs).toBe(1);

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
