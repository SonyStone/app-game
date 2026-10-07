import { describe, expect, it } from 'vitest';

import { elementWarnings, importProblems, type ElementWarning } from '../src/editor/element-warnings';
import { reviewImport } from '../src/features/import/createImportReview';
import { parseSvgMarkup, type SvgElementNode } from '../src/svg-model';

function parse(markup: string): SvgElementNode {
  const result = parseSvgMarkup(markup);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.root;
}

function child(root: SvgElementNode, index = 0): SvgElementNode {
  const node = root.children.filter((item) => item.kind === 'element')[index];

  if (node?.kind !== 'element') {
    throw new Error('missing element');
  }

  return node;
}

function texts(warnings: readonly ElementWarning[]): readonly string[] {
  return warnings.map((warning) => warning.map((message) => message.text).join(' '));
}

describe('elementWarnings', () => {
  it('flags radii like GodSVG', () => {
    const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1"/><circle r="0"/><circle r="-2"/><ellipse rx="3"/></svg>');

    expect(texts(elementWarnings(child(root, 0), root))).toEqual(['No "{attribute_name}" attribute defined.']);
    expect(elementWarnings(child(root, 1), root)[0]?.[0]?.values).toEqual({ attribute_name: 'r', attribute_value: '0' });
    expect(texts(elementWarnings(child(root, 2), root))).toEqual(['Attribute "{attribute_name}" has invalid value "{attribute_value}".']);
    expect(texts(elementWarnings(child(root, 3), root))).toEqual([
      'No "{attribute_name}" attribute defined. This may be interpreted differently by different SVG software.'
    ]);
  });

  it('flags empty and single-element groups and misplaced elements', () => {
    const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><g/><g><rect/></g><stop/></svg>');

    expect(texts(elementWarnings(child(root, 0), root))).toEqual(['This group has no elements.']);
    expect(texts(elementWarnings(child(root, 1), root))).toEqual(['This group has only one element.']);
    expect(elementWarnings(child(root, 2), root)[0]?.[0]?.values).toEqual({
      element: 'stop',
      allowed: '[linearGradient, radialGradient]'
    });
  });

  it('flags gradients without id, without stops, or of one color', () => {
    const root = parse(
      [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        '<linearGradient/>',
        '<linearGradient id="a"><stop stop-color="red"/><stop offset="1" stop-color="#f00"/></linearGradient>',
        '<linearGradient id="b"><stop stop-color="red"/><stop offset="100%" stop-color="blue"/></linearGradient>',
        '<linearGradient id="c"><stop stop-color="red" stop-opacity="0"/><stop offset="1" stop-color="blue" stop-opacity="0"/></linearGradient>',
        '<linearGradient id="d"><stop offset="0.5" stop-color="red"/><stop offset="0.5" stop-color="blue"/></linearGradient>',
        '</svg>'
      ].join('')
    );

    expect(texts(elementWarnings(child(root, 0), root))).toEqual([
      'No "{attribute_name}" attribute defined.',
      'No <stop> elements under this gradient.'
    ]);
    expect(texts(elementWarnings(child(root, 1), root))).toEqual(['This gradient is a solid color.']);
    expect(elementWarnings(child(root, 2), root)).toEqual([]);
    expect(texts(elementWarnings(child(root, 3), root))).toEqual(['This gradient is a solid color.']);
    // A hard edge is still a transition.
    expect(elementWarnings(child(root, 4), root)).toEqual([]);
  });
});

describe('import review', () => {
  it('lists unrecognized elements and attributes once each', () => {
    const root = parse('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="x"><text data-a="1">a</text><rect data-a="2" foo="1"/></svg>');

    expect(importProblems(root)).toEqual({ elements: ['text'], attributes: ['xmlns:xlink', 'data-a', 'foo'] });
  });

  it('passes clean SVG straight through and reports syntax errors', () => {
    expect(reviewImport('<svg xmlns="http://www.w3.org/2000/svg"><rect width="2"/></svg>', 'a.svg')).toBeUndefined();
    expect(reviewImport('<svg><g></svg>', 'b.svg')?.syntaxError).toBeTruthy();
  });
});
