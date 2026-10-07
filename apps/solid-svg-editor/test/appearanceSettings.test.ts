import { describe, expect, it } from 'vitest';

import { highlighterPresets } from '../src/editor/appearance';
import { defaultSettings, restoreSettings } from '../src/editor/defaults';
import { createGridLines } from '../src/editor/handles';
import { themePresetSettings } from '../src/editor/tree-utils';

describe('appearance settings', () => {
  it('restores valid values and falls back per field', () => {
    const restored = restoreSettings(
      JSON.stringify({
        themePreset: 'light',
        highlighter: { element: '#123456', symbol: 'red' },
        handles: { size: 2, selected: '#00ff00', normal: 7 },
        selectionRectangle: { speed: 0, width: 99, color1: '#fff8' },
        gridTickInterval: 5,
        uiScale: 1.5,
        panningSpeed: -3,
        fonts: { main: 'Inter.ttf', other: 'x', mono: 3 }
      })
    );

    expect(restored.highlighter.element).toBe('#123456');
    expect(restored.highlighter.symbol).toBe(highlighterPresets['default-light'].symbol);
    expect(restored.highlighterPreset).toBe('default-light');
    expect(restored.handles).toMatchObject({ size: 2, selected: '#00ff00', normal: '#111111', hovered: '#808080' });
    expect(restored.selectionRectangle).toMatchObject({ speed: 0, width: 2, color1: '#fff8', color2: '#000000cc' });
    expect(restored.gridTickInterval).toBe(5);
    expect(restored.uiScale).toBe(1.5);
    expect(restored.panningSpeed).toBe(20);
    expect(restored.fonts).toEqual({ main: 'Inter.ttf' });
    expect(restoreSettings('{"uiScale":"huge"}').uiScale).toBe('auto');
  });

  it('resets theme-dependent colors with the theme preset, like GodSVG', () => {
    const light = themePresetSettings('light', defaultSettings());

    expect(light.highlighterPreset).toBe('default-light');
    expect(light.highlighter).toEqual(highlighterPresets['default-light']);
    expect(light.basicColors.valid).toBe('#22bb22');
    expect(themePresetSettings('gray', light).handles.hovered).toBe('#aaaaaa');
  });

  it('places major grid lines every tick interval, or none', () => {
    const view = { x: 0, y: 0, width: 512, height: 64 };

    expect(createGridLines(view, 1, 64, 4).majorVertical).toEqual([0, 256, 512]);
    expect(createGridLines(view, 1, 64, 5).majorVertical).toEqual([0, 320]);
    expect(createGridLines(view, 1, 64, 0).majorVertical).toEqual([0]);
  });
});
