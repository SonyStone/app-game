// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createGradient, type GradientStop } from './createGradient';
import { GradientStops } from './GradientStops';

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

it('adds a stop where the bar is pressed, edits the chosen one and keeps at least two', () => {
  const [stops, setStops] = createSignal<GradientStop[]>([
    { position: 0, color: 'foreground', alpha: 1 },
    { position: 1, color: 'background', alpha: 1 }
  ]);
  const host = document.body.appendChild(document.createElement('div'));
  const dispose = render(
    () => (
      <GradientStops
        stops={stops()}
        colors={{ foreground: '#000000', background: '#ffffff' }}
        linear
        onChange={setStops}
      />
    ),
    host
  );
  flush();
  const query = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
  expect(query<HTMLButtonElement>('[aria-label="Delete color stop"]').disabled).toBe(true);

  const bar = query<HTMLElement>('[aria-label="Add a color stop"]');
  bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 24 }) as DOMRect;
  bar.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 150 }));
  flush();
  expect(stops()).toHaveLength(3);
  expect(stops()[2]).toEqual({ position: 0.75, color: 'background', alpha: 1 });

  const color = query<HTMLSelectElement>('[aria-label="Stop color"]');
  color.value = 'custom';
  color.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(stops()[2]!.color).toBe('#ffffff');
  const opacity = query<HTMLInputElement>('[aria-label="Stop opacity"]');
  opacity.value = '40';
  opacity.dispatchEvent(new Event('input', { bubbles: true }));
  flush();
  expect(stops()[2]!.alpha).toBe(0.4);

  query<HTMLButtonElement>('[aria-label="Delete color stop"]').click();
  flush();
  expect(stops()).toHaveLength(2);
  dispose();
});

it('turns settings saved before stops into stops and resolves stops when drawing', () => {
  localStorage.setItem('paint.gradient', JSON.stringify({ kind: 'radial', end: 'background', reverse: true }));
  const sent: unknown[] = [];
  const gradient = createRoot(() =>
    createGradient({
      active: () => true,
      colors: () => ({ foreground: '#112233', background: '#445566' }),
      area: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      selection: () => [],
      canDraw: () => true,
      send: (command) => sent.push(command)
    })
  );
  expect(gradient.settings().stops.map((stop) => stop.color)).toEqual(['background', 'foreground']);
  gradient.canvasAction.run({ x: 0, y: 0 });
  gradient.canvasAction.move!({ x: 50, y: 0 });
  gradient.canvasAction.end!(false);
  expect(sent[0]).toMatchObject({
    command: {
      kind: 'radial',
      stops: [
        { position: 0, color: '#445566', alpha: 1 },
        { position: 1, color: '#112233', alpha: 1 }
      ]
    }
  });
});
