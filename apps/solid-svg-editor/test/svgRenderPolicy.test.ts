import { describe, expect, it } from 'vitest';

import { isRenderableElement, renderableAttributes, rootPresentationAttributes } from '../src/features/viewport/svg-render-policy';

describe('svg render policy', () => {
  it('skips elements that would run code or restyle the editor', () => {
    expect(isRenderableElement('script')).toBe(false);
    expect(isRenderableElement('SCRIPT')).toBe(false);
    expect(isRenderableElement('style')).toBe(false);
    expect(isRenderableElement('path')).toBe(true);
    expect(isRenderableElement('foreignObject')).toBe(true);
  });

  it('drops event handlers, javascript URLs, and link targets', () => {
    const attrs = [
      { name: 'fill', value: 'red' },
      { name: 'onload', value: 'alert(1)' },
      { name: 'onClick', value: 'alert(1)' },
      { name: 'to', value: ' java\tscript:alert(1)' },
      { name: 'href', value: '#gradient' }
    ];

    expect(renderableAttributes('rect', attrs).map((attr) => attr.name)).toEqual(['fill', 'href']);
    expect(renderableAttributes('a', attrs).map((attr) => attr.name)).toEqual(['fill']);
  });

  it('carries inheritable root attributes but not root sizing, ids, or namespaces', () => {
    const attrs = [
      { name: 'xmlns', value: 'http://www.w3.org/2000/svg' },
      { name: 'xmlns:xlink', value: 'http://www.w3.org/1999/xlink' },
      { name: 'id', value: 'icon' },
      { name: 'width', value: '24' },
      { name: 'height', value: '24' },
      { name: 'viewBox', value: '0 0 24 24' },
      { name: 'fill', value: 'none' },
      { name: 'stroke', value: 'currentColor' },
      { name: 'stroke-width', value: '2' },
      { name: 'onload', value: 'alert(1)' }
    ];

    expect(rootPresentationAttributes(attrs).map((attr) => attr.name)).toEqual(['fill', 'stroke', 'stroke-width']);
  });
});
