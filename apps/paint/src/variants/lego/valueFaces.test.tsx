// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createGrid, GridContext } from './grid';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import {
  chooseValueFace,
  faceNameStyle,
  nameInitials,
  oneCellFace,
  readValueFace,
  valueFace,
  valueFaceKey,
  ValueFaceSwitch,
  valueGlyph
} from './parts/valueFaces';
import { createTestServices } from './testServices';
import { textWidth } from './textFit';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  chooseValueFace('plain');
  flush();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

const size = { id: 'size', label: 'Size', short: 'Sz' };
const fade = {
  id: 'brush:abr-scattering-countFade',
  label: 'Scatter count fade length',
  short: 'Scatter count fade length'
};
/** A one-cell part's box at a cell of `cell` px. */
const cell = (edge: number) => ({ width: edge, height: edge });

it.each([24, 28, 32, 44])('names a %i px knob and number by the short name above the number', (edge) => {
  expect(oneCellFace('name', 'knob', cell(edge), size)).toMatchObject({ name: 'SZ', below: false, approach: false });
  expect(oneCellFace('name', 'number', cell(edge), size).name).toBe('SZ');
});

it('falls back from the short name to the initials, then to two letters, and drops only what does not fit', () => {
  const knob = (room: number) => oneCellFace('name', 'knob', { width: room + 4, height: 28 }, fade).name;
  const width = (text: string) => textWidth(text, faceNameStyle) + 1;
  expect(knob(width('SCATTER COUNT FADE LENGTH'))).toBe('SCATTER COUNT FADE LENGTH');
  expect(knob(width('SCF'))).toBe('SCF');
  expect(knob(width('SC'))).toBe('SC');
  expect(knob(width('SC') - 1)).toBeUndefined();
  expect(nameInitials('Layer opacity')).toBe('LO');
  expect(nameInitials('FG/BG jitter')).toBe('FBJ');
  expect(nameInitials('Smoothing')).toBe('SM');
});

it('stacks a name or a glyph only where both rows fit the face, 20 px, the face of a 24 px cell', () => {
  expect(oneCellFace('name', 'knob', cell(24), size).name).toBe('SZ');
  expect(oneCellFace('name', 'knob', { width: 40, height: 23 }, size).name).toBeUndefined();
  expect(oneCellFace('glyph', 'knob', cell(24), size).glyph).toBe('size');
  expect(oneCellFace('glyph', 'number', { width: 40, height: 23 }, size).glyph).toBeUndefined();
});

it('gives each kind of value its glyph and every other value the generic one', () => {
  expect(
    ['size', 'opacity', 'brush:flow', 'hue', 'saturation', 'brightness', 'brush:smoothing', 'layer-opacity'].map(
      valueGlyph
    )
  ).toEqual(['size', 'opacity', 'flow', 'hue', 'saturation', 'brightness', 'smoothing', 'layerOpacity']);
  expect(valueGlyph('brush:abr-scattering-countFade')).toBe('sliders');
});

it('puts the gauge name in the opening, as wide as its chord, under the number, with the name on approach', () => {
  const shown = oneCellFace('gauge', 'knob', cell(28), fade);
  expect(shown).toMatchObject({ gauge: true, below: true, approach: true });
  expect(textWidth(shown.name!, faceNameStyle) + 1).toBeLessThanOrEqual(28 * Math.SQRT1_2);
  expect(oneCellFace('gauge', 'number', cell(28), size)).toMatchObject({ name: 'SZ', gauge: false, below: true });
});

it('adds nothing to the part for the name on approach, and nothing at all for the plain face', () => {
  expect(oneCellFace('approach', 'knob', cell(28), size)).toEqual({
    name: undefined,
    glyph: undefined,
    gauge: false,
    below: false,
    approach: true
  });
  expect(oneCellFace('plain', 'knob', cell(28), size).approach).toBe(false);
});

it('shows the name over the number on a knob and on a number look, and over the dash of an inactive value', () => {
  chooseValueFace('name');
  expect(mountPart('value:size', 'knob').part.textContent).toBe('SZ32');
  expect(mountPart('value:size', 'number').part.textContent).toBe('SZ');
  expect(mountPart('value:brush:abr-scattering-countFade', 'knob').part.textContent).toMatch(/^SCF?—$/);
});

it('tags the value with its full name while a pen hovers, never for a finger, and with the value while pressed', () => {
  chooseValueFace('approach');
  const { part, knob } = mountPart('value:size', 'knob');
  const state = part.querySelector<HTMLElement>('[aria-disabled]')!;

  pointer(state, 'pointerenter', 0, { pointerType: 'touch' });
  expect(tag()).toBeNull();
  pointer(state, 'pointerenter', 0, { buttons: 1 });
  expect(tag()).toBeNull();
  pointer(state, 'pointerenter', 0);
  expect(tag()).toBe('Size');
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

it('names an inactive value on hover and on a press, without a value', () => {
  chooseValueFace('approach');
  const { part } = mountPart('value:brush:abr-scattering-countFade', 'knob');
  const state = part.querySelector<HTMLElement>('[aria-disabled]')!;
  pointer(state, 'pointerdown', 0);
  expect(tag()).toBe('Scatter count fade length');
});

it('opens the popup on a tap, and only shows the name for a press held without moving', () => {
  chooseValueFace('approach');
  const { knob, onPopup } = mountPart('value:size', 'knob');
  pointer(knob, 'pointerdown', 100, { timeStamp: 1000 });
  pointer(knob, 'pointerup', 100, { timeStamp: 1600 });
  expect(onPopup).not.toHaveBeenCalled();
  pointer(knob, 'pointerdown', 100, { timeStamp: 2000 });
  pointer(knob, 'pointerup', 100, { timeStamp: 2100 });
  expect(onPopup).toHaveBeenCalledTimes(1);
});

it('keeps the plain face a tap that opens the popup however long it is held', () => {
  const { knob, onPopup } = mountPart('value:size', 'knob');
  pointer(knob, 'pointerdown', 100, { timeStamp: 1000 });
  pointer(knob, 'pointerup', 100, { timeStamp: 1600 });
  expect(onPopup).toHaveBeenCalledTimes(1);
  expect(tag()).toBeNull();
});

it('keeps the trial face per device, stepping through the faces with the switch beside Edit', () => {
  expect(readValueFace()).toBe('plain');
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(() => <ValueFaceSwitch />, host));
  const button = host.querySelector('button')!;
  expect(button.textContent).toBe('Plain');
  button.click();
  flush();
  expect(valueFace()).toBe('name');
  expect(button.textContent).toBe('1 Name');
  expect(localStorage.getItem(valueFaceKey)).toBe('name');
  expect(readValueFace()).toBe('name');
  for (let step = 0; step < 4; step += 1) {
    button.click();
    flush();
  }

  flush();
  expect(valueFace()).toBe('plain');

  localStorage.setItem(valueFaceKey, 'unknown');
  expect(readValueFace()).toBe('plain');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readValueFace()).toBe('plain');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  chooseValueFace('gauge');
  flush();
  expect(valueFace()).toBe('gauge');
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
