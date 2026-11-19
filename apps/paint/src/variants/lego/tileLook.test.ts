// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { createTileLook, defaultTileLook, plateRadii, readTileLook, tileLookKey } from './tileLook';

afterEach(() => localStorage.clear());

it('keeps the chosen look on the device and reads it back', () => {
  // Changes come from presses, outside any owner, as in the switch.
  const { look, change, dispose } = createRoot((dispose) => ({ ...createTileLook(), dispose }));
  expect(look()).toEqual(defaultTileLook);

  change({ radius: plateRadii.soft, squircle: true });
  flush();
  expect(look()).toEqual({ radius: 20, squircle: true });
  dispose();

  expect(JSON.parse(localStorage.getItem(tileLookKey)!)).toEqual({ radius: 20, squircle: true });
  expect(readTileLook()).toEqual({ radius: 20, squircle: true });
});

it('falls back to the default for a missing, corrupt or invalid entry', () => {
  expect(readTileLook()).toEqual(defaultTileLook);

  localStorage.setItem(tileLookKey, '{not json');
  expect(readTileLook()).toEqual(defaultTileLook);

  localStorage.setItem(tileLookKey, JSON.stringify({ radius: 400, squircle: 'yes' }));
  expect(readTileLook()).toEqual({ radius: 28, squircle: false });
});

it("reads an entry from the trial's first round, keeping its radius and squircle choice", () => {
  localStorage.setItem(tileLookKey, JSON.stringify({ look: 'C', radius: 20, squircle: true, dim: 12 }));
  expect(readTileLook()).toEqual({ radius: 20, squircle: true });
});

it('keeps the look for the page when storage refuses the write', () => {
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new DOMException('Full', 'QuotaExceededError');
  };

  try {
    const { look, change, dispose } = createRoot((dispose) => ({ ...createTileLook(), dispose }));
    change({ radius: plateRadii.sharp });
    flush();
    expect(look().radius).toBe(6);
    dispose();
  } finally {
    Storage.prototype.setItem = setItem;
  }
});

/**
 * The radius rule as the stylesheet states it: every corner token is the plate radius less the distance to it, never
 * below zero, then multiplied by the corner scale. Evaluates the tokens declared on `.editor` for a plate radius and a
 * scale, by default the plain arcs' 1.
 */
function cornerTokens(radius: number, scale = 1) {
  const css = stylesheet('LegoStudio');
  const editor = /^\.editor \{([\s\S]*?)^\}/m.exec(css)![1]!;
  const declared = new Map(
    [
      ...editor.matchAll(/(--lego-r[\w-]*|--lego-radius|--lego-corner-scale|--settings-list[\w-]*radius):\s*([^;]+);/g)
    ].map((match) => [match[1]!, match[2]!])
  );
  declared.set('--lego-radius', `${radius}px`);
  declared.set('--lego-corner-scale', `${scale}`);
  const value = (name: string): number => {
    const expression = declared
      .get(name)!
      .replace(/var\((--[\w-]+)\)/g, (_match, inner: string) => `${value(inner)}`)
      .replace(/px/g, '')
      .replace(/calc/g, '')
      .replace(/max/g, 'Math.max');
    return Function(`return ${expression}`)() as number;
  };

  return Object.fromEntries([...declared.keys()].map((name) => [name, value(name)]));
}

it('derives every corner from the plate radius, an inner one being the outer less the distance, never below zero', () => {
  expect(cornerTokens(plateRadii.today)).toMatchObject({
    '--lego-r-plate': 13,
    '--lego-r-outline': 11,
    '--lego-r-bar-button': 9,
    '--lego-r-tile': 7,
    '--lego-r-popup-tile': 5,
    '--lego-r-inner': 4,
    '--lego-r-card-key': 3,
    '--lego-r-card-mark': 0,
    '--settings-list-radius': 5,
    '--settings-list-icon-radius': 0
  });
  expect(cornerTokens(plateRadii.soft)).toMatchObject({ '--lego-r-tile': 14, '--lego-r-inner': 11 });
  expect(cornerTokens(plateRadii.sharp)).toMatchObject({
    '--lego-r-plate': 6,
    '--lego-r-tile': 0,
    '--lego-r-inner': 0,
    '--lego-r-card-key': 0
  });
});

it('scales every corner alike for squircles, after the distances are taken off as for arcs', () => {
  const css = stylesheet('LegoStudio');
  const scale = Number(/\.editor\.squircleLook \{[^}]*--lego-corner-scale:\s*([\d.]+);/.exec(css)![1]);
  expect(scale).toBeCloseTo((1 - Math.SQRT1_2) / (1 - 0.5 ** 0.25), 2);

  const arcs = cornerTokens(plateRadii.soft);
  const squircles = cornerTokens(plateRadii.soft, scale);
  for (const name of Object.keys(arcs)) {
    expect(squircles[name]).toBeCloseTo(name === '--lego-radius' ? arcs[name]! : arcs[name]! * scale, 5);
  }
});

/** The LEGO stylesheets. */
const sheets = ['LegoStudio', 'LayerParts', 'FloatingGrip', 'FileMenu', 'PartsShowcase'];

it('leaves no fixed corner radius in the LEGO stylesheets but circles and pills', () => {
  const fixed = sheets
    .map(stylesheet)
    .flatMap((css) => [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1]!))
    .filter(
      (value) => !/var\(--lego-r|inherit|^50%$|^999px$|^0$|^2px$|calc\(18px \/ var\(--card-scale\)\)/.test(value)
    );

  expect(fixed).toEqual([]);
});

it('shapes every corner through one shared rule, which circles and pills keep round', () => {
  const declared = sheets
    .map(stylesheet)
    .flatMap((css) => [...css.matchAll(/(^|[\s;{])corner-shape:\s*([^;]+);/g)].map((match) => match[2]!));
  expect(declared.filter((value) => value !== 'round')).toEqual(['var(--lego-corner-shape)']);
  expect(stylesheet('LegoStudio')).toMatch(
    /^:where\(\.editor, \.editor \*\),\n:where\(\.editor \*\)::before,\n:where\(\.editor \*\)::after \{\n {2}corner-shape: var\(--lego-corner-shape\);\n\}/m
  );

  // The rule weighs nothing, so a circle or pill in LEGO or in a feature it hosts stays round with its own
  // declaration beside its radius, and a squircle look does not square it off.
  const features = path.resolve(here, '../..');
  const hosted = ['features', 'shared'].flatMap((folder) =>
    readdirSync(path.join(features, folder), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(path.join(features, folder, file), 'utf8'))
  );
  const shapes = [...sheets.map(stylesheet), ...hosted].flatMap((css) =>
    [...css.matchAll(/border-radius:\s*(50%|999px|50% 50% 50% 0);\n(.*)\n/g)].map((match) => match[2]!.trim())
  );
  expect(shapes.length).toBeGreaterThan(40);
  expect(new Set(shapes)).toEqual(new Set(['corner-shape: round;']));
});

/** The text of the LEGO stylesheet `name`, read from disk. */
function stylesheet(name: string) {
  return readFileSync(path.join(here, `${name}.module.css`), 'utf8');
}

/** The folder of this test, beside the LEGO stylesheets. */
const here = path.dirname(fileURLToPath(import.meta.url));
