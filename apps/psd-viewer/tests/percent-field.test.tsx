/** @vitest-environment jsdom */
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { PercentField } from '../src/features/layers/PercentField';

it('holds a scrub draft and commits exactly once on release, restoring the stored percentage after refusal', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const commit = vi.fn(async () => false);
  const dispose = render(() => <PercentField label="Opacity" value={255} disabled={false} onCommit={commit} />, host);
  try {
    flush();
    const label = host.querySelector('span')!;
    const field = host.querySelector('input')!;
    label.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true }));
    flush();
    for (const x of [96, 89, 80, 68]) {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, buttons: 1 }));
      flush();
    }
    expect(field.value).toBe('68');
    expect(commit).not.toHaveBeenCalled();
    window.dispatchEvent(new MouseEvent('pointerup'));
    flush();
    await Promise.resolve();
    flush();
    expect(commit).toHaveBeenCalledExactlyOnceWith(173);
    expect(field.value).toBe('100');
  } finally {
    dispose();
    host.remove();
  }
});

it('cancels a scrub with Escape and ignores releases after cancellation or disposal', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const commit = vi.fn(async () => true);
  const dispose = render(() => <PercentField label="Fill" value={128} disabled={false} onCommit={commit} />, host);
  flush();
  host.querySelector('span')!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true }));
  flush();
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 104, shiftKey: true, buttons: 1 }));
  flush();
  expect(host.querySelector('input')!.value).toBe('90');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  flush();
  expect(host.querySelector('input')!.value).toBe('50');
  window.dispatchEvent(new MouseEvent('pointerup'));
  flush();
  dispose();
  host.remove();
  window.dispatchEvent(new MouseEvent('pointerup'));
  expect(commit).not.toHaveBeenCalled();
});
