import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { defaultBrush, type Brush } from './brush';
import { BrushPanel } from './BrushPanel';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

it('switches smoothing modes with independent strengths and retains pressure settings', () => {
  const { host, brush } = setup();
  const mode = host.querySelector<HTMLSelectElement>('[aria-label="Stroke smoothing"]')!;
  expect(mode.value).toBe('studio');
  expect(host.querySelector('[aria-label="Stabilization"]')).toBeNull();
  select(mode, 'normal');
  expect(range(host, 'Stabilization').value).toBe('1');
  input(range(host, 'Stabilization'), '4');
  input(range(host, 'Pressure firmness'), '200');
  select(mode, 'smooth');
  expect(range(host, 'Stabilization').value).toBe('10');
  expect(range(host, 'Pressure firmness').value).toBe('200');
  const catchUp = [...host.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Catch up'))!
    .querySelector('input')!;
  catchUp.checked = false;
  catchUp.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(brush().stroke.catchUp).toBe(false);
  input(range(host, 'Stabilization'), '20');
  select(mode, 'normal');
  expect(range(host, 'Stabilization').value).toBe('4');
  expect(brush().stroke).toMatchObject({ normal: 4, smooth: 20, firmness: 2 });
  select(mode, 'studio');
  expect(host.querySelector('[aria-label="Pressure minimum"]')).toBeNull();
  expect(brush().stroke.firmness).toBe(2);
});

it('keeps a positive pressure range while adjusting either endpoint', () => {
  const { host, brush } = setup();
  select(host.querySelector<HTMLSelectElement>('[aria-label="Stroke smoothing"]')!, 'smooth');
  input(range(host, 'Pressure minimum'), '79');
  expect(range(host, 'Pressure maximum').min).toBe('80');
  input(range(host, 'Pressure maximum'), '90');
  expect(range(host, 'Pressure minimum').max).toBe('89');
  expect(brush().stroke).toMatchObject({ minimum: 0.79, maximum: 0.9 });
});

function setup() {
  const [brush, setBrush] = createSignal(defaultBrush());
  const updateBrush = (patch: Partial<Brush>) => setBrush((current) => ({ ...current, ...patch }));
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <BrushPanel brush={brush} updateBrush={updateBrush} />, host);
  flush();
  return { host, brush };
}

function select(element: HTMLSelectElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
}

function range(host: HTMLElement, name: string) {
  return host.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
}

function input(element: HTMLInputElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
}
