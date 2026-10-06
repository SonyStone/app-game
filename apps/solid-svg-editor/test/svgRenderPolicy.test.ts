import { describe, expect, it } from 'vitest';

import { isRenderableElement, renderableAttributes } from '../src/features/viewport/svg-render-policy';

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
});
