import { describe, expect, it } from 'vitest';

import { svgCapabilities } from '../src/editor/capabilities';
import { clampNumericAttribute, orderedAttributes } from '../src/editor/tree-utils';

describe('tree-utils SVG metadata adapters', () => {
  it('orders recognized attributes and fills defaults from capabilities', () => {
    const rect = svgCapabilities.createElement('rect');
    const ordered = orderedAttributes(rect);

    expect(ordered.slice(0, 4).map((attr) => attr.name)).toEqual(['transform', 'opacity', 'fill', 'fill-opacity']);
    expect(ordered.find((attr) => attr.name === 'width')).toEqual({ name: 'width', value: '300' });
  });

  it('clamps numeric attributes from capability range metadata', () => {
    expect(clampNumericAttribute('width', '-10')).toBe('0');
    expect(clampNumericAttribute('opacity', '2')).toBe('1');
    expect(clampNumericAttribute('x', '-10')).toBe('-10');
    expect(clampNumericAttribute('not-real', '-10')).toBe('-10');
  });
});
