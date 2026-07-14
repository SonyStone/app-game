import { describe, expect, it } from 'vitest';

import { getSvgAttribute } from '../src/editor/svg-attributes';
import { createElementNode } from '../src/svg-model';

describe('getSvgAttribute', () => {
  it('uses only explicit fallback values instead of core SVG metadata defaults', () => {
    const rect = createElementNode('rect', [{ name: 'x', value: '24' }]);

    expect(getSvgAttribute(rect, 'x', '0')).toBe('24');
    expect(getSvgAttribute(rect, 'width')).toBe('');
    expect(getSvgAttribute(rect, 'width', '300')).toBe('300');
  });
});
