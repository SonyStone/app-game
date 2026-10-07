import { describe, expect, it } from 'vitest';

import { idValidity } from '../src/editor/id-validity';
import { evaluateNumberExpression } from '../src/editor/number-expression';
import { ancestorElements, inheritedAttributeValue, orderedAttributes } from '../src/editor/tree-utils';
import { parseSvgMarkup, type SvgElementNode } from '../src/svg-model';

describe('evaluateNumberExpression', () => {
  it('evaluates arithmetic, functions, and constants like GodSVG', () => {
    expect(evaluateNumberExpression('-2.2 + 4')).toBeCloseTo(1.8);
    expect(evaluateNumberExpression('10 * 3 / 2')).toBe(15);
    expect(evaluateNumberExpression('2 ** 3 ** 2')).toBe(512);
    expect(evaluateNumberExpression('-2 ** 2')).toBe(-4);
    expect(evaluateNumberExpression('(1 + 2) % 2')).toBe(1);
    expect(evaluateNumberExpression('sqrt(16) + max(1, 4, 2)')).toBe(8);
    expect(evaluateNumberExpression('tau / 2')).toBeCloseTo(Math.PI);
    expect(evaluateNumberExpression('+5')).toBe(5);
    expect(evaluateNumberExpression('1e3')).toBe(1000);
    expect(evaluateNumberExpression('2,5')).toBe(2.5);
  });

  it('returns NaN for anything that is not a number expression', () => {
    for (const text of ['', 'abc', 'alert(1)', '1 +', '(1', 'sqrt(1, 2)', '10mm', '1 / 0', 'max()']) {
      expect(evaluateNumberExpression(text), text).toBeNaN();
    }
  });
});

describe('idValidity', () => {
  it('follows GodSVG id rules', () => {
    expect(idValidity('')).toBe('valid');
    expect(idValidity('icon-1_a.b:c')).toBe('valid');
    expect(idValidity('значок')).toBe('valid');
    expect(idValidity('#icon')).toBe('invalid');
    expect(idValidity('two words')).toBe('invalid');
    expect(idValidity('a/b')).toBe('warning');
  });
});

describe('inherited attribute values', () => {
  const root = parse('<svg xmlns="http://www.w3.org/2000/svg" stroke="red"><g fill="blue"><rect id="r" width="1"/></g></svg>');
  const group = root.children[0] as SvgElementNode;
  const rect = group.children[0] as SvgElementNode;

  it('finds ancestors from the parent up to the root', () => {
    expect(ancestorElements(root, rect.id)).toEqual([group, root]);
    expect(ancestorElements(root, root.id)).toEqual([]);
  });

  it('takes propagated attributes from the nearest ancestor and others from element defaults', () => {
    const ancestors = ancestorElements(root, rect.id);

    expect(inheritedAttributeValue(rect, ancestors, 'fill')).toBe('blue');
    expect(inheritedAttributeValue(rect, ancestors, 'stroke')).toBe('red');
    expect(inheritedAttributeValue(rect, ancestors, 'stroke-width')).toBe('1');
    expect(inheritedAttributeValue(rect, ancestors, 'x')).toBe('0');
  });

  it('leaves unset recognized attributes empty', () => {
    const attrs = orderedAttributes(rect);

    expect(attrs.find((attr) => attr.name === 'width')?.value).toBe('1');
    expect(attrs.find((attr) => attr.name === 'height')?.value).toBe('');
  });
});

function parse(markup: string): SvgElementNode {
  const parsed = parseSvgMarkup(markup);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.root;
}
