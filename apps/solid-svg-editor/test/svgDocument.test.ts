import { describe, expect, it } from 'vitest';

import { parseSvgDocument } from '../src/editor/svg-document';

describe('SvgDocument resource index', () => {
  it('indexes reusable resources and references by target id', () => {
    const parsed = parseSvgDocument(`
      <svg viewBox="0 0 10 10">
        <defs>
          <linearGradient id="paint">
            <stop offset="0" stop-color="red" />
          </linearGradient>
          <symbol id="shape">
            <circle cx="5" cy="5" r="4" />
          </symbol>
        </defs>
        <rect id="target" fill="url(#paint)" clip-path="url('#shape')" />
        <use href="#shape" />
      </svg>
    `);

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.resources.byId.get('paint')).toMatchObject({
      id: 'paint',
      elementName: 'linearGradient',
      kind: 'paint-server'
    });
    expect(parsed.document.resources.byId.get('shape')).toMatchObject({
      id: 'shape',
      elementName: 'symbol',
      kind: 'symbol'
    });
    expect(parsed.document.resources.references.map((reference) => reference.targetId)).toEqual([
      'paint',
      'shape',
      'shape'
    ]);
  });
});
