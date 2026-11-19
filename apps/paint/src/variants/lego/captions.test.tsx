// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { chipsAlong } from './colorParts';
import { createGrid, GridContext } from './grid';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { partDefinition, partDefinitions } from './parts';
import { shortNames } from './parts/actions';
import { gridSizeKind } from './parts/options';
import { brushValueParts, valueCaptions, valueTextWidths } from './parts/values';
import { createTestServices } from './testServices';
import { fitsLines, fitText, textWidth } from './textFit';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  flush();
  document.body.replaceChildren();
});

const brightness = {
  label: 'Brightness',
  short: 'B',
  unit: '%',
  widths: valueTextWidths({ chip: ['40%', '0%', '100%'], numbers: ['40', '0', '100'] })
};

it('shows the first caption that fits, and none when none does', () => {
  const style = { size: 13, weight: 600 };
  const full = textWidth('Brightness', style);
  expect(fitText(full + 1, style, 'Brightness', 'B')).toBe('Brightness');
  expect(fitText(full, style, 'Brightness', 'B')).toBe('B');
  expect(fitText(4, style, 'Brightness', 'B')).toBeUndefined();
  expect(fitText(200, style, undefined, '', 'B')).toBe('B');
});

it('wraps a caption between words only, onto the lines there are', () => {
  const style = { size: 11 };
  const smooth = textWidth('Smooth', style) + 1;
  expect(fitsLines('Smooth color', style, smooth, 2)).toBe(true);
  expect(fitsLines('Smooth color', style, smooth, 1)).toBe(false);
  expect(fitsLines('Smooth color', style, smooth - 2, 4)).toBe(false);
});

it.each([
  [188, 'Brightness', true],
  [156, 'B', true],
  [92, undefined, true],
  [60, undefined, false]
] as const)('names a %i px slider %s, keeping its value chip while the chip fits', (width, caption, chip) => {
  const shown = valueCaptions({ ...brightness, width, height: 28, vertical: false, cell: 28 });
  expect(shown.sliderCaption).toBe(caption);
  expect(shown.chip).toBe(chip);
});

it('decides a vertical slider along its height', () => {
  const opacity = { ...brightness, label: 'Opacity', short: 'Op' };
  expect(valueCaptions({ ...opacity, width: 28, height: 156, vertical: true, cell: 28 }).sliderCaption).toBe('Opacity');
  expect(valueCaptions({ ...opacity, width: 156, height: 28, vertical: true, cell: 28 }).chip).toBe(false);
});

it.each([
  [92, 'Hue', true],
  [68, 'H', true],
  [48, undefined, true],
  [28, undefined, false]
] as const)('gives a %i px number %s and the unit where they fit beside the widest number', (width, caption, unit) => {
  const hue = {
    label: 'Hue',
    short: 'H',
    unit: '°',
    widths: valueTextWidths({ chip: ['212°', '0°', '360°'], numbers: ['212', '0', '360'] })
  };
  const shown = valueCaptions({ ...hue, width, height: 28, vertical: false, cell: 28 });
  expect(shown.caption).toBe(caption);
  expect(shown.unit).toBe(unit);
});

it('drops a knob unit that does not fit its face, keeping the number', () => {
  const small = { ...brightness, widths: valueTextWidths({ chip: ['5%', '0%', '9%'], numbers: ['5', '0', '9'] }) };
  expect(valueCaptions({ ...small, width: 28, height: 28, vertical: false, cell: 28 }).bareKnob).toBe(false);
  expect(valueCaptions({ ...brightness, width: 28, height: 28, vertical: false, cell: 28 }).bareKnob).toBe(true);
});

it('counts color chips by their pixels, two to a 44 px cell and one to a 28 px one', () => {
  expect([44, 92, 28, 60, 188].map(chipsAlong)).toEqual([2, 4, 1, 2, 9]);
});

it.each([
  [44, 3, 'Brush settings'],
  [28, 4, 'Brush settings'],
  [28, 3, 'Settings'],
  [28, 1, '']
] as const)('names an action at %i px cells and %i columns: "%s"', (cell, columns, name) => {
  expect(partText('action:brush-editor', cell, { columns, rows: 1 })).toBe(name);
});

it.each([
  ['layer:lock', 6, 1, 'Lock transparent pixels'],
  ['layer:lock', 5, 1, ''],
  ['layers:smooth-color', 4, 1, 'Smooth color'],
  ['layers:smooth-color', 3, 2, 'Smooth color'],
  ['layers:smooth-color', 3, 1, '']
] as const)('labels %s at %i×%i only where its words fit their lines', (kind, columns, rows, name) => {
  expect(partText(kind, 28, { columns, rows })).toBe(name);
});

it('names a swatch, a preset and the fore/back pair only where their text fits', () => {
  expect(partText('color:swatch', 28, { columns: 3, rows: 1 })).toMatch(/^#[0-9a-f]{6}$/);
  expect(partText('color:swatch', 28, { columns: 2, rows: 2 })).toBe('');
  expect(partText('color:pair', 28, { columns: 5, rows: 1 })).toBe('ForegroundBackground');
  expect(partText('color:pair', 28, { columns: 4, rows: 1 })).toBe('');
});

/** The text a part of `kind` shows at `span` on a grid of `cell` px cells. */
function partText(kind: string, cell: number, span: { columns: number; rows: number }) {
  const services = createRoot((dispose) => {
    disposers.push(dispose);
    return createTestServices().services;
  });
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <GridContext value={createGrid(() => cell)}>
          <LegoServicesContext value={services}>
            <PartFrame kind={kind} span={span} />
          </LegoServicesContext>
        </GridContext>
      ),
      host
    )
  );
  flush();
  return host.textContent ?? '';
}

it('never shows two parts with the same caption: Brush settings is "Settings" when short, the Options part "Options"', () => {
  const definitions = [...partDefinitions, ...brushValueParts, partDefinition(gridSizeKind)!];
  const labels = definitions.map((definition) => definition.label.toLowerCase());
  const shorts = Object.values(shortNames).map((name) => name.toLowerCase());
  const repeated = (names: string[]) => names.filter((name, index) => names.indexOf(name) !== index);

  expect(repeated(labels)).toEqual([]);
  expect(repeated([...new Set(labels), ...shorts])).toEqual([]);
  expect(partDefinition('action:options')!.label).toBe('Options');
  expect(shortNames['brush-editor']).toBe('Settings');
});
