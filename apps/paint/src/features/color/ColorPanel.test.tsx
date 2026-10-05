// @vitest-environment jsdom
import { type Brush, defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ColorPanel } from './ColorPanel';
import { hexToHsv, hsvToHex, parseHex } from './hsv';

let host: HTMLDivElement;
let dispose: () => void;
let brush: () => Brush;

beforeEach(() => {
  localStorage.clear();
  const [value, setValue] = createSignal({ ...defaultBrush(), color: '#344b66', backgroundColor: '#ffffff' });
  brush = value;
  host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <ColorPanel brush={value()} onChange={(patch) => setValue({ ...value(), ...patch })} />, host);
  flush();
});

afterEach(() => {
  dispose();
  host.remove();
});

it('converts between hex and HSV, keeping hue and saturation where the color does not determine them', () => {
  for (const hex of ['#344b66', '#ff0000', '#00e85d', '#ece6da', '#000000', '#ffffff']) {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  }

  expect(hexToHsv('#000000', { h: 210, s: 0.5, v: 0.4 })).toEqual({ h: 210, s: 0.5, v: 0 });
  expect(hexToHsv('#808080', { h: 210, s: 0.5, v: 0.4 }).h).toBe(210);
  expect(parseHex(' #AbC ')).toBe('#aabbcc');
  expect(parseHex('12345g')).toBeUndefined();
});

it('drags the plane and hue strip with a captured pointer and remembers the color when the drag ends', () => {
  const plane = slider('Saturation and brightness');
  const hue = slider('Hue');
  for (const element of [plane, hue]) {
    element.setPointerCapture = () => {};
    element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 });
  }

  pointer(hue, 'pointerdown', 0, 50);
  pointer(hue, 'pointerup', 0, 50);
  pointer(plane, 'pointerdown', 200, 0, 'touch');
  expect(brush().color).toBe('#ff0000');
  expect(host.querySelector('[class*="loupe"]')).not.toBeNull();

  pointer(plane, 'pointermove', 400, 200, 'touch');
  expect(brush().color).toBe('#000000');
  pointer(plane, 'pointermove', 100, 50, 'touch');
  expect(brush().color).toBe('#804040');
  pointer(plane, 'pointerup', 100, 50, 'touch');
  expect(host.querySelector('[class*="loupe"]')).toBeNull();
  expect(host.querySelector('[aria-label="Set color #804040"]')).not.toBeNull();
  expect(JSON.parse(localStorage.getItem('paint.recentColors')!)).toEqual(['#804040', '#663434']);
});

it('keeps the hue while dragging through black', () => {
  const plane = slider('Saturation and brightness');
  plane.setPointerCapture = () => {};
  plane.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 });
  const hue = Number(slider('Hue').getAttribute('aria-valuenow'));

  pointer(plane, 'pointerdown', 100, 100);
  pointer(plane, 'pointermove', 100, 0);
  expect(Number(slider('Hue').getAttribute('aria-valuenow'))).toBe(hue);
  expect(brush().color).not.toBe('#ffffff');
});

it('edits the background with keys, hex entry and swatches', () => {
  host.querySelector<HTMLButtonElement>('[role="radio"]:nth-child(2)')!.click();
  flush();
  slider('Saturation and brightness').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })
  );
  flush();
  expect(brush().backgroundColor).toBe('#e6e6e6');
  expect(brush().color).toBe('#344b66');

  const hex = host.querySelector<HTMLInputElement>('[aria-label="Hex color"]')!;
  hex.value = 'f80';
  hex.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(brush().backgroundColor).toBe('#ff8800');
  expect(hex.value).toBe('FF8800');

  hex.value = 'nope';
  hex.dispatchEvent(new Event('change', { bubbles: true }));
  flush();
  expect(hex.value).toBe('FF8800');

  host.querySelector<HTMLButtonElement>('[aria-label="Set color #167bd7"]')!.click();
  host.querySelector<HTMLButtonElement>('[aria-label="Restore #FFFFFF"]')!.click();
  flush();
  expect(brush().backgroundColor).toBe('#ffffff');
});

function slider(label: string) {
  return host.querySelector<HTMLElement>(`[role="slider"][aria-label="${label}"]`)!;
}

function pointer(target: HTMLElement, type: string, clientX: number, clientY: number, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.assign(event, { pointerId: 1, pointerType });
  target.dispatchEvent(event);
  flush();
}

it('offers another picker in place of the square, which edits the color and settles into recents', () => {
  const [chosen, setChosen] = createSignal('square');
  const [color, setColor] = createSignal('#344b66');
  const other = document.body.appendChild(document.createElement('div'));
  const stop = render(
    () => (
      <ColorPanel
        brush={{ ...defaultBrush(), color: color() }}
        onChange={(patch) => patch.color && setColor(patch.color)}
        alternatives={{
          chosen: chosen(),
          onChoose: setChosen,
          options: [
            {
              id: 'wheel',
              label: 'Wheel',
              render: (control) => (
                <button
                  aria-label="Alternative"
                  onClick={() => {
                    control.onChange('#ff8800');
                    control.onSettle();
                  }}
                >
                  {control.color}
                </button>
              )
            },
            { id: 'other', label: 'Other', render: () => <p aria-label="Other picker" /> }
          ]
        }}
      />
    ),
    other
  );
  flush();
  const within = (selector: string) => other.querySelector<HTMLElement>(selector);
  expect(within('[aria-label="Saturation and brightness"]')).not.toBeNull();
  [...other.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent === 'Wheel')!.click();
  flush();
  expect(within('[aria-label="Saturation and brightness"]')).toBeNull();
  within('[aria-label="Alternative"]')!.click();
  flush();
  expect(color()).toBe('#ff8800');
  expect(within('[aria-label="Alternative"]')!.textContent).toBe('#ff8800');
  expect(within('[aria-label="Set color #ff8800"]')).not.toBeNull();
  [...other.querySelectorAll<HTMLElement>('[role="radio"]')].find((radio) => radio.textContent === 'Other')!.click();
  flush();
  expect(within('[aria-label="Alternative"]')).toBeNull();
  expect(within('[aria-label="Other picker"]')).not.toBeNull();
  stop();
  other.remove();
});
