import { describe, expect, it } from 'vitest';

import { exportFileName, maxRasterSize, rasterSize } from '../src/editor/export-utils';
import { highlightHtml, highlightSvg } from '../src/features/code-editor/svg-highlight';

describe('highlightSvg', () => {
  it('colors tags, attributes, strings, text, entities, comments, and CDATA like GodSVG', () => {
    const tokens = highlightSvg('<svg a="1" fill="red"><!-- c --><text>x &amp; y</text><![CDATA[z]]></svg>');

    expect(tokens.map((token) => `${token.kind}:${token.text}`)).toEqual([
      'symbol:<',
      'element:svg',
      'plain: ',
      'unknown-attribute:a',
      'symbol:=',
      'string:"1"',
      'plain: ',
      'attribute:fill',
      'symbol:=',
      'string:"red"',
      'symbol:>',
      'comment:<!-- c -->',
      'symbol:<',
      'unknown-element:text',
      'symbol:>',
      'text:x ',
      'entity:&amp;',
      'text: y',
      'symbol:</',
      'unknown-element:text',
      'symbol:>',
      'cdata:<![CDATA[z]]>',
      'symbol:</',
      'element:svg',
      'symbol:>'
    ]);
  });

  it('always covers the whole text and marks unreadable markup as errors', () => {
    for (const source of ['<svg a=1>', '<!-- open', '<rect x="1" <', 'plain', '']) {
      expect(highlightSvg(source).map((token) => token.text).join(''), source).toBe(source);
    }

    expect(highlightSvg('<rect x=1>').some((token) => token.kind === 'error')).toBe(true);
  });

  it('escapes HTML in the highlight layer', () => {
    expect(highlightHtml(highlightSvg('a<b'))).not.toContain('<b');
    expect(highlightHtml([{ kind: 'text', text: '<script>' }])).toContain('&lt;script&gt;');
  });
});

describe('export helpers', () => {
  it('names files after the tab', () => {
    expect(exportFileName('Tiger.svg', 'png')).toBe('Tiger.png');
    expect(exportFileName('icon.final.svg', 'jpeg')).toBe('icon.final.jpg');
    expect(exportFileName('', 'webp')).toBe('image.webp');
  });

  it('scales raster sizes and caps them', () => {
    const dimensions = { width: 100, height: 50, viewBox: [0, 0, 100, 50] as const };

    expect(rasterSize(dimensions, 2.5)).toEqual({ width: 250, height: 125 });
    expect(rasterSize(dimensions, 1000).width).toBe(maxRasterSize);
  });
});
