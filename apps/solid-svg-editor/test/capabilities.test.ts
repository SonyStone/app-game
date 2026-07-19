import { describe, expect, it } from 'vitest';

import { svgCapabilities } from '../src/editor/capabilities';

describe('SvgCapabilityRegistry', () => {
  it('exposes attribute metadata for inspector controls', () => {
    expect(svgCapabilities.getAttribute('fill')).toMatchObject({
      name: 'fill',
      type: 'color',
      defaultValue: 'black',
      color: {
        allowNone: true,
        allowUrl: true,
        allowCurrentColor: true
      }
    });
    expect(svgCapabilities.getAttribute('stroke-linecap').enumValues).toEqual(['butt', 'round', 'square']);
  });

  it('identifies compact attributes and specialist editor attributes', () => {
    expect(svgCapabilities.isCompactAttribute('path', 'stroke')).toBe(true);
    expect(svgCapabilities.isCompactAttribute('path', 'd')).toBe(false);
    expect(svgCapabilities.isCompactAttribute('polygon', 'points')).toBe(false);
    expect(svgCapabilities.isCompactAttribute('path', 'not-real')).toBe(false);
  });
});
