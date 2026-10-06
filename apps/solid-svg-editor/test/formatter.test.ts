import { describe, expect, it } from 'vitest';

import { compactFormatter, serializeRoot } from '../src/formatter';
import { parseSvgMarkup, type SvgElementNode, type SvgNode } from '../src/svg-model';

describe('formatter escaping', () => {
  it('writes values with both quote kinds, markup characters, comments, and CDATA as well-formed XML', () => {
    const root = {
      id: 'root',
      kind: 'element',
      name: 'svg',
      attrs: [
        { name: 'xmlns', value: 'http://www.w3.org/2000/svg' },
        { name: 'font-family', value: `"O'Neil" & <Sans>` },
        { name: 'data-label', value: '"quoted"' }
      ],
      children: [
        { id: 'text', kind: 'text', text: 'a ]]> b < c & d' },
        { id: 'comment', kind: 'comment', text: 'a -- b ---' },
        { id: 'cdata', kind: 'cdata', text: 'x ]]> y' }
      ],
      expanded: true
    } as unknown as SvgElementNode;

    const markup = serializeRoot(root, compactFormatter);

    expect(markup).toContain(`font-family="&quot;O'Neil&quot; &amp; &lt;Sans&gt;"`);
    expect(markup).toContain(`data-label='"quoted"'`);
    expect(markup).toContain('a ]]&gt; b &lt; c &amp; d');
    expect(markup).toContain('<!--a - - b - - - -->');
    expect(markup).toContain('<![CDATA[x ]]]]><![CDATA[> y]]>');

    // happy-dom's XML parser has no CDATA support, so the round trip covers the other nodes.
    const parsed = parseSvgMarkup(markup.replace(/<!\[CDATA\[.*\]\]>/, ''));

    if (!parsed.ok) {
      throw new Error(parsed.message);
    }

    expect(parsed.root.attrs.map((attr) => attr.value)).toEqual(root.attrs.map((attr) => attr.value));
    expect(textOf(parsed.root.children[0])).toBe('a ]]> b < c & d');
  });
});

function textOf(node: SvgNode | undefined): string | undefined {
  return node && node.kind !== 'element' ? node.text : undefined;
}
