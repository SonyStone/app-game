// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createGrid, GridContext } from './grid';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import * as faces from './parts/valueFaces';
import { faceNameStyle, nameInitials, oneCellFace } from './parts/valueFaces';
import { createTestServices } from './testServices';
import { textWidth } from './textFit';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  flush();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

const size = { label: 'Size', short: 'Sz' };
const fade = { label: 'Scatter count fade length', short: 'Scatter count fade length' };
/** A one-cell part's box at a cell of `edge` px. */
const cell = (edge: number) => ({ width: edge, height: edge });

it.each([
  // cell, knob ring, knob gap, number gap
  [24, 1.5, 2, 3],
  [28, 1.5, 3, 4],
  [32, 2, 4, 4],
  [44, 2, 4, 4]
])('names a %i px knob and number by the short name, spaced by the room left over', (edge, ring, gap, numberGap) => {
  const knob = oneCellFace('knob', cell(edge), size);
  expect(knob).toMatchObject({ name: 'SZ', ring, gap });
  // The two inks (7 px capitals, 9 px digits) and the gap, centred on the face.
  expect(knob.nameOffset).toBe((9 + gap) / 2);
  expect(knob.numberOffset).toBe((7 + gap) / 2);
  expect(oneCellFace('number', cell(edge), size)).toMatchObject({ name: 'SZ', ring: 0, gap: numberGap });
});

it('keeps at least as much room above, between and below the name and number as before, more from 28 px', () => {
  // Before: 2 px of arc, the 8 px name row 2 px over the 10 px number row, which left 2 px above and 2 px between.
  const margin = (edge: number) => {
    const face = oneCellFace('knob', cell(edge), size);
    return (edge - 2 * face.ring - 7 - face.gap - 9) / 2;
  };
  expect(margin(24)).toBe(1.5);
  expect(margin(28)).toBe(3);
  expect(oneCellFace('knob', cell(28), size).gap).toBe(3);
  expect(margin(32)).toBe(4);
  expect(margin(44)).toBe(10);
});

it('falls back from the short name to the initials, then to two letters, and drops only what does not fit', () => {
  // `room` is what a 28 px knob's face leaves its name: its width less 1.5 px of arc and half a pixel each side.
  const knob = (room: number) => oneCellFace('knob', { width: room + 4, height: 28 }, fade).name;
  const width = (text: string) => textWidth(text, faceNameStyle) + 1;
  expect(knob(width('SCATTER COUNT FADE LENGTH'))).toBe('SCATTER COUNT FADE LENGTH');
  expect(knob(width('SCF'))).toBe('SCF');
  expect(knob(width('SC'))).toBe('SC');
  expect(knob(width('SC') - 1)).toBeUndefined();
  expect(nameInitials('Layer opacity')).toBe('LO');
  expect(nameInitials('FG/BG jitter')).toBe('FBJ');
  expect(nameInitials('Smoothing')).toBe('SM');
});

it('names a value at every cell from 24 px, its long names by initials where they do not fit', () => {
  for (const edge of [24, 28, 32, 44]) {
    expect(oneCellFace('knob', cell(edge), fade).name).toMatch(/^SCF?$/);
    expect(oneCellFace('number', cell(edge), fade).name).toMatch(/^SCF?$/);
  }

  const layer = { label: 'Layer opacity', short: 'Layer' };
  const fitsLayer = textWidth('LAYER', faceNameStyle) + 1 <= 44 - 2 * 2 - 2 * 0.5;
  expect(oneCellFace('knob', cell(44), layer).name).toBe(fitsLayer ? 'LAYER' : 'LO');
  expect(oneCellFace('knob', cell(24), { label: 'Layer opacity', short: 'Layer' }).name).toBe('LO');
});

it('stacks the name only where both lines fit with 2 px between them and a pixel to each edge', () => {
  // 7 + 9 px of ink, 2 px apart, a pixel above and below, inside 1.5 px of arc: 23 px.
  expect(oneCellFace('knob', { width: 40, height: 23 }, size).name).toBe('SZ');
  expect(oneCellFace('knob', { width: 40, height: 22 }, size).name).toBeUndefined();
  expect(oneCellFace('number', { width: 40, height: 19 }, size).name).toBe('SZ');
  expect(oneCellFace('number', { width: 40, height: 18 }, size).name).toBeUndefined();
});

it('shows the name over the number on a knob and on a number look, and over the dash of an inactive value', () => {
  expect(mountPart('value:size', 'knob').part.textContent).toBe('SZ32');
  expect(mountPart('value:size', 'number').part.textContent).toBe('SZ');
  expect(mountPart('value:brush:abr-scattering-countFade', 'knob').part.textContent).toMatch(/^SCF?—$/);
});

it('tags the value with its full name and value while a pen hovers, never for a finger, and live while pressed', () => {
  const { part, knob } = mountPart('value:size', 'knob');
  const state = part.querySelector<HTMLElement>('[aria-disabled]')!;

  pointer(state, 'pointerenter', 0, { pointerType: 'touch' });
  expect(tag()).toBeNull();
  pointer(state, 'pointerenter', 0, { buttons: 1 });
  expect(tag()).toBeNull();
  pointer(state, 'pointerenter', 0);
  expect(tag()).toBe('Size32');
  pointer(state, 'pointerleave', 0);
  expect(tag()).toBeNull();

  pointer(knob, 'pointerdown', 100, { pointerType: 'touch' });
  expect(tag()).toBe('Size32');
  pointer(knob, 'pointermove', 160, { pointerType: 'touch' });
  expect(tag()).not.toBe('Size32');
  expect(tag()).toMatch(/^Size\d+$/);
  pointer(window, 'pointerup', 160, { pointerType: 'touch' });
  expect(tag()).toBeNull();
});

it('tags a percentage with its unit, and a captionless number look too', () => {
  const { part } = mountPart('value:opacity', 'number');
  pointer(part.querySelector('[aria-disabled]')!, 'pointerenter', 0);
  expect(tag()).toBe('Opacity100%');
});

it('names an inactive value with the dash its face shows, on hover and on a press', () => {
  const { part } = mountPart('value:brush:abr-scattering-countFade', 'knob');
  const state = part.querySelector<HTMLElement>('[aria-disabled]')!;
  pointer(state, 'pointerenter', 0);
  expect(tag()).toBe('Scatter count fade length—');
  pointer(state, 'pointerleave', 0);
  pointer(state, 'pointerdown', 0);
  expect(tag()).toBe('Scatter count fade length—');
  pointer(window, 'pointerup', 0);
  expect(tag()).toBeNull();
});

it('opens the popup on a tap, and only shows the tag for a press held without moving', () => {
  const { knob, onPopup } = mountPart('value:size', 'knob');
  pointer(knob, 'pointerdown', 100, { timeStamp: 1000 });
  pointer(knob, 'pointerup', 100, { timeStamp: 1000 + faces.peekHold });
  expect(onPopup).not.toHaveBeenCalled();
  pointer(knob, 'pointerdown', 100, { timeStamp: 2000 });
  pointer(knob, 'pointerup', 100, { timeStamp: 2000 + faces.peekHold - 1 });
  expect(onPopup).toHaveBeenCalledTimes(1);
});

it('places the tag above its part, under it at the top of the window, and inside the window', () => {
  const { part } = mountPart('value:size', 'knob');
  const state = part.querySelector<HTMLElement>('[aria-disabled]')!;
  const at = (rect: Partial<DOMRect>) =>
    vi
      .spyOn(state, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 28, height: 28, right: 28, bottom: 28, ...rect } as DOMRect);
  pointer(state, 'pointerenter', 0);
  const element = document.querySelector<HTMLElement>('[role="status"][popover]')!;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 60, height: 22 } as DOMRect);
  const placed = () =>
    new Promise<{ left: string; top: string }>((resolve) =>
      requestAnimationFrame(() => resolve({ left: element.style.left, top: element.style.top }))
    );

  at({ left: 200, top: 300, bottom: 328, right: 228 });
  return placed()
    .then((above) => {
      expect(above).toEqual({ left: `${214 - 30}px`, top: `${300 - 6 - 22}px` });
      at({ left: 2, top: 4, bottom: 32, right: 30 });
      return placed();
    })
    .then((below) => {
      expect(below).toEqual({ left: '6px', top: `${32 + 6}px` });
    });
});

it('leaves no trace of the trial: no switch, no stored treatment, no other faces', () => {
  localStorage.setItem('paint.lego.value-face-trial', 'gauge');
  expect(Object.keys(faces).sort()).toEqual(
    ['NameTag', 'createNameTag', 'faceNameStyle', 'nameInitials', 'oneCellFace', 'peekHold'].sort()
  );
  expect(mountPart('value:size', 'knob').part.textContent).toBe('SZ32');
  expect(document.querySelector('[data-face="gauge"], [data-face="below"]')).toBeNull();
});

/** Mounts a one-cell value part of `kind` in `look` on a 28 px grid. */
function mountPart(kind: string, look: 'knob' | 'number') {
  const services = createRoot((dispose) => {
    disposers.push(dispose);
    return createTestServices().services;
  });
  const onPopup = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <GridContext value={createGrid(() => 28)}>
          <LegoServicesContext value={services}>
            <PartFrame kind={kind} span={{ columns: 1, rows: 1 }} look={look} onPopup={onPopup} />
          </LegoServicesContext>
        </GridContext>
      ),
      host
    )
  );
  flush();
  return { part: host, knob: host.querySelector<HTMLElement>('[role="slider"]')!, onPopup };
}

/** The text of the name tag showing, or `null`. */
function tag() {
  return document.querySelector('[role="status"][popover]')?.textContent ?? null;
}

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  options: { pointerType?: string; buttons?: number; timeStamp?: number } = {}
) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: 0,
    bubbles: !['pointerenter', 'pointerleave'].includes(type),
    cancelable: true,
    buttons: options.buttons ?? 0
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: options.pointerType ?? 'pen' },
    ...(options.timeStamp === undefined ? {} : { timeStamp: { value: options.timeStamp } })
  });
  target.dispatchEvent(event);
  flush();
}
