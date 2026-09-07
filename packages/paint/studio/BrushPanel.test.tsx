import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, it } from 'vitest';
import { defaultBrush } from './brush';
import { BrushPanel } from './BrushPanel';

it('selects raw input without Leonardo controls and retains stabilization settings when switching back', () => {
  const [brush, setBrush] = createSignal(defaultBrush(), { ownedWrite: true });
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(
    () => <BrushPanel brush={brush} updateBrush={(patch) => setBrush({ ...brush(), ...patch })} />,
    host
  );
  try {
    flush();
    const select = host.querySelector<HTMLSelectElement>('[aria-label="Stroke smoothing"]')!;
    const change = (mode: string) => {
      select.value = mode;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      flush();
    };
    expect(select.value).toBe('studio');
    change('smooth');
    setBrush({ ...brush(), stroke: { ...brush().stroke, smooth: 23 } });
    flush();
    expect(host.querySelector('[aria-label="Stabilization"]')).not.toBeNull();
    change('none');
    expect(brush().stroke.mode).toBe('none');
    expect(select.value).toBe('none');
    expect(host.textContent).toContain('No path smoothing or stabilization');
    expect(host.querySelector('[aria-label="Stabilization"]')).toBeNull();
    expect(host.querySelector('[aria-label="Pressure firmness"]')).toBeNull();
    change('smooth');
    expect(brush().stroke.smooth).toBe(23);
    expect(host.querySelector<HTMLInputElement>('[aria-label="Stabilization"]')!.value).toBe('23');
  } finally {
    dispose();
    host.remove();
  }
});
