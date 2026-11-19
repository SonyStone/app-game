// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
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

  change({ look: 'C', radius: plateRadii.soft, squircle: true });
  flush();
  expect(look()).toEqual({ look: 'C', radius: 20, squircle: true });
  dispose();

  expect(JSON.parse(localStorage.getItem(tileLookKey)!)).toEqual({ look: 'C', radius: 20, squircle: true });
  expect(readTileLook()).toEqual({ look: 'C', radius: 20, squircle: true });
});

it('falls back to the default for a missing, corrupt or invalid entry', () => {
  expect(readTileLook()).toEqual(defaultTileLook);

  localStorage.setItem(tileLookKey, '{not json');
  expect(readTileLook()).toEqual(defaultTileLook);

  localStorage.setItem(tileLookKey, JSON.stringify({ look: 'Z', radius: 400, squircle: 'yes' }));
  expect(readTileLook()).toEqual({ look: 'A', radius: 24, squircle: false });
});

it('keeps the look for the page when storage refuses the write', () => {
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new DOMException('Full', 'QuotaExceededError');
  };

  try {
    const { look, change, dispose } = createRoot((dispose) => ({ ...createTileLook(), dispose }));
    change({ look: 'B' });
    flush();
    expect(look().look).toBe('B');
    dispose();
  } finally {
    Storage.prototype.setItem = setItem;
  }
});

/**
 * The radius rule as the stylesheet states it: every corner token is the plate radius less the distance to it, never
 * below zero. Evaluates the tokens declared on `.editor` for a plate radius.
 */
function cornerTokens(radius: number) {
  const css = stylesheet('LegoStudio');
  const editor = /^\.editor \{([\s\S]*?)^\}/m.exec(css)![1]!;
  const declared = new Map(
    [...editor.matchAll(/(--lego-r[\w-]*|--lego-radius):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!])
  );
  declared.set('--lego-radius', `${radius}px`);
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
    '--lego-r-tile': 7,
    '--lego-r-inner': 4,
    '--lego-r-popup-tile': 5,
    '--lego-r-card-key': 3,
    '--lego-r-bar-button': 9
  });
  expect(cornerTokens(plateRadii.soft)).toMatchObject({ '--lego-r-tile': 14, '--lego-r-inner': 11 });
  expect(cornerTokens(plateRadii.sharp)).toMatchObject({
    '--lego-r-plate': 6,
    '--lego-r-tile': 0,
    '--lego-r-inner': 0,
    '--lego-r-card-key': 0
  });
});

it('leaves no fixed corner radius in the LEGO stylesheets but circles and pills', () => {
  const sheets = ['LegoStudio', 'LayerParts', 'FloatingGrip', 'FileMenu', 'PartsShowcase'].map(stylesheet);
  const fixed = sheets
    .flatMap((css) => [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1]!))
    .filter((value) => !/var\(--lego-r|inherit|^50%$|^999px$|^0$|^2px$|calc\(18px \/ var\(--card-scale\)\)/.test(value));

  expect(fixed).toEqual([]);
});

/** The text of the LEGO stylesheet `name`, read from disk. */
function stylesheet(name: string) {
  return readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), `${name}.module.css`), 'utf8');
}
