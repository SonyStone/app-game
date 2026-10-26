// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hexToWheel } from '../color-wheel/oklch';
import { CoolorusWheel, type CoolorusSettings } from './CoolorusWheel';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.unstubAllGlobals();
  dispose = undefined;
  document.body.replaceChildren();
});

it('turns the hue along the RYB ring, at the same lightness while locked', () => {
  const [color, setColor] = createSignal('#c8553d');
  const [settings, setSettings] = createSignal<CoolorusSettings>({ hues: 'ryb', lockLightness: true });
  const change = vi.fn((next: string) => setColor(next));
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(
    () => (
      <CoolorusWheel
        color={color()}
        onChange={change}
        onSettle={() => {}}
        settings={settings()}
        onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
      />
    ),
    host
  );
  flush();

  const ring = host.querySelector<SVGElement>('[aria-label="Hue on the RYB wheel"]')!;
  const start = Number(ring.getAttribute('aria-valuenow'));
  ring.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
  flush();

  expect(Number(ring.getAttribute('aria-valuenow'))).toBe(start + 10);
  expect(hexToWheel(change.mock.lastCall![0]).l).toBeCloseTo(hexToWheel('#c8553d').l, 2);

  host.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')!.click();
  flush();
  expect(settings().hues).toBe('rgb');
  expect(host.querySelector('[aria-label="Hue"]')).not.toBeNull();
});
