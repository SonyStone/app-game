import { describe, expect, it } from 'vitest';

import { defaultPanelLayout, movePart, restorePanelLayout, type PanelLayout } from '../src/features/layout/panel-layout';

const layout = (top: PanelLayout['top'], bottom: PanelLayout['bottom'], excluded: PanelLayout['excluded']): PanelLayout => ({
  top,
  bottom,
  excluded,
  split: 0.5
});

describe('movePart', () => {
  it('reorders inside a section and moves between sections', () => {
    expect(movePart(defaultPanelLayout(), 'inspector', { kind: 'inside', section: 'top', index: 2 })?.top).toEqual(['code', 'inspector']);
    expect(movePart(defaultPanelLayout(), 'previews', { kind: 'inside', section: 'top', index: 1 })).toEqual(
      layout(['inspector', 'previews', 'code'], [], [])
    );
    expect(movePart(defaultPanelLayout(), 'code', { kind: 'inside', section: 'excluded', index: 0 })).toEqual(
      layout(['inspector'], [], ['code', 'previews'])
    );
  });

  it('splits into a new section above or below when one side is free', () => {
    expect(movePart(defaultPanelLayout(), 'previews', { kind: 'below' })).toEqual(layout(['inspector', 'code'], ['previews'], []));
    expect(movePart(defaultPanelLayout(), 'code', { kind: 'above' })).toEqual(layout(['code'], ['inspector'], ['previews']));
    expect(movePart(layout(['inspector'], ['code'], ['previews']), 'previews', { kind: 'above' })).toBeUndefined();
  });

  it('keeps one part shown and the top section filled', () => {
    expect(movePart(layout(['inspector'], [], ['code', 'previews']), 'inspector', { kind: 'inside', section: 'excluded', index: 0 })).toBeUndefined();
    expect(movePart(layout(['inspector'], ['code'], ['previews']), 'inspector', { kind: 'inside', section: 'excluded', index: 0 })).toEqual(
      layout(['code'], [], ['inspector', 'previews'])
    );
  });
});

describe('restorePanelLayout', () => {
  it('drops unknown and repeated parts and excludes missing ones', () => {
    expect(restorePanelLayout({ top: ['code', 'code', 'nope'], bottom: [], excluded: [], split: 0.3 })).toEqual({
      top: ['code'],
      bottom: [],
      excluded: ['inspector', 'previews'],
      split: 0.3
    });
    expect(restorePanelLayout({ top: [], bottom: ['inspector'] }).top).toEqual(['inspector']);
    expect(restorePanelLayout(undefined)).toEqual(defaultPanelLayout());
  });
});
