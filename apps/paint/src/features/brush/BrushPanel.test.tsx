// @vitest-environment jsdom
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, it } from 'vitest';
import { BrushAdvancedControls, BrushDailyControls } from './BrushPanel';

it('selects raw input without Leonardo controls and retains stabilization settings when switching back', () => {
  const [brush, setBrush] = createSignal(defaultBrush(), { ownedWrite: true });
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => {
    const change = (patch: Partial<Brush>) => setBrush({ ...brush(), ...patch });
    return (
      <>
        <BrushDailyControls brush={brush()} onChange={change} />
        <BrushAdvancedControls brush={brush()} onChange={change} />
      </>
    );
  }, host);
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

    // The SAI-like stabilizer has its own level, catch-up switch and pressure calibration.
    change('stabilizer');
    expect(brush().stroke.mode).toBe('stabilizer');
    const level = host.querySelector<HTMLInputElement>('[aria-label="Stabilizer"]')!;
    expect(level.value).toBe('6');
    level.value = '12';
    level.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
    expect(brush().stroke.stabilizer).toBe(12);
    expect(host.textContent).toContain('S-12');
    expect(host.textContent).toContain('Catch up on pen lift');
    expect(host.querySelector('[aria-label="Pressure firmness"]')).not.toBeNull();
  } finally {
    dispose();
    host.remove();
  }
});
