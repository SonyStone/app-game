import { describe, expect, it } from 'vitest';

import { convertElement, possibleConversions } from '../src/editor/element-conversion';
import { optimizeNode } from '../src/editor/tree-utils';
import { parseSvgMarkup, type SvgElementNode } from '../src/svg-model';

describe('convertElement', () => {
  it('converts circles and keeps the id and unrelated attributes', () => {
    const circle = element('<circle cx="10" cy="20" r="5" fill="red"/>');

    expect(convertElement(circle, 'ellipse')).toMatchObject({ id: circle.id, name: 'ellipse', attrs: attrs('rx=5 ry=5 cx=10 cy=20 fill=red') });
    expect(convertElement(circle, 'rect')?.attrs).toEqual(attrs('x=5 y=15 width=10 height=10 rx=5 ry=5 fill=red'));
    expect(convertElement(circle, 'path')?.attrs).toEqual([
      { name: 'd', value: 'M 15 20 a 5 5 0 0 1 -10 0 a 5 5 0 0 1 10 0 z' },
      { name: 'fill', value: 'red' }
    ]);
  });

  it('refuses conversions that would change the shape', () => {
    expect(convertElement(element('<ellipse rx="5" ry="3"/>'), 'circle')).toBeUndefined();
    expect(convertElement(element('<ellipse rx="4" ry="4"/>'), 'circle')?.attrs).toEqual(attrs('r=4'));
    expect(convertElement(element('<rect width="10" height="5" rx="1"/>'), 'polygon')).toBeUndefined();
    expect(convertElement(element('<path d="M0 0 Q5 5 10 0 Z"/>'), 'polygon')).toBeUndefined();
    expect(convertElement(element('<path d="M0 0 L10 0 L10 10"/>'), 'polygon')).toBeUndefined();
    expect(convertElement(element('<circle cx="50%" r="5"/>'), 'rect')).toBeUndefined();
    expect(convertElement(element('<circle r="5"/>'), 'polygon')).toBeUndefined();
  });

  it('converts rects to polygons, paths, and back', () => {
    const rect = element('<rect width="10" height="5"/>');

    expect(convertElement(rect, 'polygon')?.attrs).toEqual(attrs('points=0_0_10_0_10_5_0_5'));
    expect(convertElement(rect, 'path')?.attrs).toEqual([{ name: 'd', value: 'M 0 0 h 10 v 5 h -10 z' }]);
    expect(convertElement(element('<polygon points="0 0 5 0 10 0 10 10 0 10"/>'), 'rect')?.attrs).toEqual(
      attrs('x=0 y=0 width=10 height=10')
    );
    expect(convertElement(element('<rect width="10" height="10" rx="5"/>'), 'circle')?.attrs).toEqual(attrs('cx=5 cy=5 r=5'));
  });

  it('converts between lines, polylines, and straight paths', () => {
    expect(convertElement(element('<line x2="10" y2="10"/>'), 'polyline')?.attrs).toEqual(attrs('points=0_0_10_10 fill=none'));
    expect(convertElement(element('<line x2="10" fill="red"/>'), 'polyline')?.attrs).toEqual(attrs('points=0_0_10_0 fill=red'));
    expect(convertElement(element('<polyline points="0 0 5 5 10 10" fill="none"/>'), 'line')?.attrs).toEqual(
      attrs('x1=0 y1=0 x2=10 y2=10')
    );
    expect(convertElement(element('<path d="M0 0 h10 v10 z"/>'), 'polygon')?.attrs).toEqual(attrs('points=0_0_10_0_10_10'));
    expect(convertElement(element('<path d="M0 0 C3 0 6 0 10 0"/>'), 'polyline')?.attrs).toEqual(attrs('points=0_0_10_0'));
  });

  it('lists conversion targets per element', () => {
    expect(possibleConversions(element('<rect/>'))).toEqual(['circle', 'ellipse', 'polygon', 'path']);
    expect(possibleConversions(element('<g/>'))).toEqual([]);
  });
});

describe('optimizer shape conversion', () => {
  it('replaces shapes with simpler equivalents', () => {
    const names = (markup: string) => {
      const parsed = parseSvgMarkup(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
      const optimized = parsed.ok ? optimizeNode(parsed.root, { removeComments: true, convertShapes: true, simplifyPathParameters: false }) : null;
      return optimized?.kind === 'element' ? optimized.children.map((child) => (child.kind === 'element' ? child.name : child.kind)) : [];
    };

    expect(names('<ellipse rx="2" ry="2"/><ellipse rx="2" ry="3"/>')).toEqual(['circle', 'ellipse']);
    expect(names('<rect width="4" height="4" rx="2"/><rect width="4" height="2" rx="2" ry="1"/><rect width="4" height="2" rx="0"/><rect width="4" height="2" rx="1"/>')).toEqual([
      'circle',
      'ellipse',
      'path',
      'rect'
    ]);
    expect(names('<line x2="1"/><polygon points="0 0 1 1 1 0"/><polyline points="0 0 1 1"/>')).toEqual(['path', 'path', 'path']);
  });
});

function element(markup: string): SvgElementNode {
  const parsed = parseSvgMarkup(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);

  if (!parsed.ok || parsed.root.children[0]?.kind !== 'element') {
    throw new Error('expected one element');
  }

  return parsed.root.children[0];
}

/** `"x=1 points=0_0_1_1"` → attributes; underscores stand for spaces inside a value. */
function attrs(spec: string) {
  return spec.split(' ').map((pair) => {
    const [name = '', value = ''] = pair.split('=');
    return { name, value: value.replaceAll('_', ' ') };
  });
}
