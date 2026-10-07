import { describe, expect, it } from 'vitest';

import { createEmptySvgDocument, parseSvgDocument } from '../src/editor/svg-document';
import type { EditorTab } from '../src/editor/types';
import { tabsToClose } from '../src/features/documents/tab-groups';

function tab(id: string, options: { readonly dirty?: boolean; readonly empty?: boolean } = {}): EditorTab {
  const parsed = parseSvgDocument('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  const document = options.empty || !parsed.ok ? createEmptySvgDocument() : parsed.document;
  return { id, name: `${id}.svg`, document, code: '', dirty: options.dirty ?? false, parseError: undefined };
}

describe('tabsToClose', () => {
  const tabs = [tab('a', { empty: true }), tab('b', { dirty: true }), tab('c'), tab('d', { dirty: true, empty: true })];

  it("matches GodSVG's close actions relative to a tab", () => {
    expect(tabsToClose(tabs, 1, 'close')).toEqual(['b']);
    expect(tabsToClose(tabs, 1, 'close-others')).toEqual(['a', 'c', 'd']);
    expect(tabsToClose(tabs, 1, 'close-left')).toEqual(['a']);
    expect(tabsToClose(tabs, 1, 'close-right')).toEqual(['c', 'd']);
    expect(tabsToClose(tabs, 1, 'close-empty')).toEqual(['a', 'd']);
    expect(tabsToClose(tabs, 1, 'close-saved')).toEqual(['a', 'c']);
    expect(tabsToClose(tabs, 9, 'close')).toEqual([]);
  });
});
