import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';

import type { EditorFileHostServices } from '../src/features/shell/createEditorFileHostServices';
import { createEditorFileHostServices } from '../src/features/shell/createEditorFileHostServices';

describe('createEditorFileHostServices', () => {
  it('projects SVG import and reference-image host services', async () => {
    let imported: { readonly text: string; readonly name: string } | undefined;
    let services: EditorFileHostServices | undefined;
    let disposeRoot: (() => void) | undefined;

    createRoot((dispose) => {
      services = createEditorFileHostServices({
        importSvgText: (text, name) => {
          imported = { text, name };
        }
      });
      disposeRoot = dispose;
    });

    if (!services) {
      throw new Error('Expected file host services');
    }

    const input = document.createElement('input');
    let clicked = false;

    input.click = () => {
      clicked = true;
    };

    expect(services.svgImport.dropActive()).toBe(false);
    services.svgImport.onDragEnter(createDragEvent('dragenter'));
    expect(services.svgImport.dropActive()).toBe(true);

    await services.svgImport.onDrop(createDragEvent('drop'));
    expect(imported).toEqual({ text: '<svg />', name: 'Dropped.svg' });
    expect(services.svgImport.dropActive()).toBe(false);

    expect(services.referenceImage.image()).toBeUndefined();
    expect(services.referenceImage.show()).toBe(true);
    expect(services.referenceImage.overlay()).toBe(false);

    services.referenceImage.setShow(false);
    services.referenceImage.setOverlay(true);
    expect(services.referenceImage.show()).toBe(false);
    expect(services.referenceImage.overlay()).toBe(true);

    services.referenceImage.setInputRef(input);
    services.referenceImage.openDialog();
    expect(clicked).toBe(true);

    disposeRoot?.();
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
