import { defaultCamera } from '@app-game/paint-core/camera';
import { describe, expect, it } from 'vitest';
import { formatKeys, matchesKeys } from './keys';
import { clampDockWidth, defaultLayout, readLayout, resizePair, sashPair } from './layout';
import { angleDegrees, clickZoom, dragView } from './viewDrag';

const key = (
  code: string,
  key: string,
  modifiers: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>> = {}
) => ({
  code,
  key,
  ctrlKey: modifiers.ctrl ?? false,
  metaKey: modifiers.meta ?? false,
  shiftKey: modifiers.shift ?? false,
  altKey: modifiers.alt ?? false
});

describe('matchesKeys', () => {
  it('matches Mod as Ctrl, or as Cmd on Apple devices', () => {
    expect(matchesKeys(key('KeyN', 'N', { ctrl: true, shift: true }), 'Mod+Shift+N', false)).toBe(true);
    expect(matchesKeys(key('KeyN', 'N', { ctrl: true, shift: true }), 'Mod+Shift+N', true)).toBe(false);
    expect(matchesKeys(key('KeyN', 'N', { meta: true, shift: true }), 'Mod+Shift+N', true)).toBe(true);
  });

  it('needs exactly the given modifiers', () => {
    expect(matchesKeys(key('KeyJ', 'j', { ctrl: true, shift: true }), 'Mod+J', false)).toBe(false);
    expect(matchesKeys(key('KeyJ', 'j'), 'Mod+J', false)).toBe(false);
    expect(matchesKeys(key('KeyH', 'h', { alt: true }), 'H', false)).toBe(false);
  });

  it('matches letters and digits by physical key on any layout', () => {
    expect(matchesKeys(key('KeyH', 'р'), 'H', false)).toBe(true);
    expect(matchesKeys(key('Digit0', ')', { ctrl: true, shift: true }), 'Mod+Shift+0', false)).toBe(true);
  });

  it('matches other keys by the typed key, and ? with or without Shift', () => {
    expect(matchesKeys(key('Tab', 'Tab'), 'Tab', false)).toBe(true);
    expect(matchesKeys(key('Slash', '?', { shift: true }), '?', false)).toBe(true);
    expect(matchesKeys(key('F1', 'F1'), 'F1', false)).toBe(true);
  });
});

describe('formatKeys', () => {
  it('writes shortcuts as the platform does', () => {
    expect(formatKeys('Mod+Shift+N', false)).toBe('Ctrl+Shift+N');
    expect(formatKeys('Mod+Shift+N', true)).toBe('⇧⌘N');
    expect(formatKeys('Mod+Alt+G', true)).toBe('⌥⌘G');
    expect(formatKeys('Alt+Backspace', false)).toBe('Alt+⌫');
    expect(formatKeys('[', false)).toBe('[');
  });
});

describe('readLayout', () => {
  it('falls back to the default layout for missing or broken data', () => {
    expect(readLayout(null)).toEqual(defaultLayout());
    expect(readLayout('{')).toEqual(defaultLayout());
    expect(readLayout('42')).toEqual(defaultLayout());
  });

  it('keeps valid fields and replaces invalid ones', () => {
    const layout = readLayout(
      JSON.stringify({ width: 9000, dock: 'left', sizes: { color: 100, brushes: -1 }, collapsed: { layers: true } })
    );
    expect(layout.width).toBe(480);
    expect(layout.dock).toBe('left');
    expect(layout.sizes).toEqual({ color: 100, brushes: defaultLayout().sizes.brushes, layers: 240 });
    expect(layout.collapsed).toEqual({ color: false, brushes: false, layers: true });
  });
});

describe('dock sizing', () => {
  it('clamps the dock width', () => {
    expect(clampDockWidth(100)).toBe(220);
    expect(clampDockWidth(300.4)).toBe(300);
  });

  it('pairs a sash with the nearest expanded panels around it', () => {
    const open = { color: false, brushes: false, layers: false };
    expect(sashPair(open, 0)).toEqual(['color', 'brushes']);
    expect(sashPair({ ...open, brushes: true }, 0)).toEqual(['color', 'layers']);
    expect(sashPair({ ...open, brushes: true }, 1)).toEqual(['color', 'layers']);
    expect(sashPair({ ...open, color: true }, 0)).toBeUndefined();
    expect(sashPair({ ...open, layers: true }, 1)).toBeUndefined();
  });

  it('moves the boundary between two panels within their minimum', () => {
    expect(resizePair({ above: 200, below: 200 }, 50, 80)).toEqual({ above: 250, below: 150 });
    expect(resizePair({ above: 200, below: 200 }, 500, 80)).toEqual({ above: 320, below: 80 });
    expect(resizePair({ above: 200, below: 200 }, -500, 80)).toEqual({ above: 80, below: 320 });
    expect(resizePair({ above: 50, below: 60 }, 20, 80)).toEqual({ above: 50, below: 60 });
  });
});

describe('view tools', () => {
  const size = { width: 800, height: 600 };

  it('pans with the pointer', () => {
    const { camera } = dragView('hand', defaultCamera(), size, {
      press: { x: 0, y: 0 },
      from: { x: 100, y: 100 },
      to: { x: 150, y: 80 },
      startAngle: 0,
      swept: 0,
      shift: false
    });
    expect(camera.x).toBeCloseTo(-50);
    expect(camera.y).toBeCloseTo(20);
  });

  it('scrubs the zoom sideways around the press', () => {
    const { camera } = dragView('zoom', defaultCamera(), size, {
      press: { x: 400, y: 300 },
      from: { x: 400, y: 300 },
      to: { x: 520, y: 300 },
      startAngle: 0,
      swept: 0,
      shift: false
    });
    expect(camera.zoom).toBeCloseTo(2);
    expect(camera.x).toBeCloseTo(0);
  });

  it('rotates around the center and snaps with Shift', () => {
    const drag = { press: { x: 600, y: 300 }, from: { x: 600, y: 300 }, startAngle: 0, swept: 0 };
    const free = dragView('rotate', defaultCamera(), size, { ...drag, to: { x: 400, y: 500 }, shift: false });
    expect(angleDegrees(free.camera.angle)).toBe(90);
    const snapped = dragView('rotate', defaultCamera(), size, { ...drag, to: { x: 600, y: 320 }, shift: true });
    expect(angleDegrees(snapped.camera.angle)).toBe(0);
    expect(snapped.swept).toBeGreaterThan(0);
  });

  it('zooms in and out on a click', () => {
    expect(clickZoom(defaultCamera(), size, { x: 400, y: 300 }, false).zoom).toBe(2);
    expect(clickZoom(defaultCamera(), size, { x: 400, y: 300 }, true).zoom).toBe(0.5);
  });

  it('shows angles from -180 to 180 degrees', () => {
    expect(angleDegrees(Math.PI * 1.5)).toBe(-90);
    expect(angleDegrees(-Math.PI)).toBe(180);
    expect(angleDegrees(-0.001)).toBe(0);
  });
});
