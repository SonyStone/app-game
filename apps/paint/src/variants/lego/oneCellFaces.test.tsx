// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets } from '../../features/brush-library';
import { gamutMasks, harmonies } from '../../features/color-wheel';
import type { DocumentState } from '../../features/layers';
import type { Span } from './board';
import { createGrid, GridContext } from './grid';
import { LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import { createTestServices } from './testServices';

vi.mock('@app-game/paint-core/preview/client', () => ({
  attachStrokePreview: () => ({ update: vi.fn(), pause: vi.fn(), dispose: vi.fn() })
}));

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  flush();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const preset = `preset:${builtInPresets[0]!.id}`;

/** The parts whose one-cell faces did not say what they were (2026-11-20). */
const repaired = [
  'color:harmony',
  'color:mask',
  'color:hex',
  'color:palette',
  'color:history',
  'layers:name',
  'layers:blend',
  'layers:list',
  'layers:smooth-color',
  'layer:lock',
  'layer:clip',
  'action:mixing',
  'value:pen-pressure-curve',
  preset
];

it('gives each repaired part a one-cell face unlike every other part of the box', () => {
  const kinds = partDefinitions
    .filter((definition) => !definition.studioOnly)
    .map((definition) => (definition.family === 'preset' ? preset : definition.kind));
  const faces = new Map(kinds.map((kind) => [kind, face(mountPart(kind).host)]));

  for (const kind of repaired) {
    expect(faces.get(kind), kind).not.toBe('');
    const twins = kinds.filter((other) => other !== kind && faces.get(other) === faces.get(kind));
    expect(twins, kind).toEqual([]);
  }
});

it('draws the chosen harmony and gamut mask, and an unlit example of each while none is chosen', () => {
  const { host, services } = mountPart('color:harmony');
  const mask = mountPart('color:mask', { services }).host;
  const harmony = () => host.querySelector('[data-glyph]')!;
  const shape = () => mask.querySelector('[data-glyph]')!;

  expect(harmony().getAttribute('data-glyph')).toBe('harmony:none');
  expect(harmony().hasAttribute('data-unlit')).toBe(true);
  expect(shape().hasAttribute('data-unlit')).toBe(true);
  expect(face(host)).not.toBe(face(mask));

  services.color.oklch.update({ harmony: 'square', mask: 'square' });
  flush();
  expect(harmony().getAttribute('data-glyph')).toBe('harmony:square');
  expect(harmony().hasAttribute('data-unlit')).toBe(false);
  expect(harmony().querySelectorAll('circle')).toHaveLength(1 + 1 + harmonies.square.offsets.length);
  expect(shape().hasAttribute('data-unlit')).toBe(false);
  expect(shape().querySelector('path')!.getAttribute('d')!.match(/[ML]/g)).toHaveLength(
    gamutMasks.square.points.length
  );
});

it('shows the list again where the chosen harmony fits it', () => {
  const narrow = mountPart('color:harmony').host;
  const wide = mountPart('color:harmony', { span: { columns: 6, rows: 1 } }).host;

  expect(narrow.querySelector('[data-pictured]')).not.toBeNull();
  expect(wide.querySelector('[data-pictured]')).toBeNull();
  expect(wide.querySelector('[data-glyph]')).toBeNull();
});

it('shows the color under a "#" where the hex does not fit, and the hex where it does', () => {
  const narrow = mountPart('color:hex').host;
  const wide = mountPart('color:hex', { span: { columns: 4, rows: 1 } }).host;
  const field = narrow.querySelector<HTMLElement>('[data-pictured]')!;

  expect(field.style.getPropertyValue('--hex-color')).toBe('#ff0000');
  expect(field.textContent).toBe('#');
  expect(narrow.querySelector('input')!.value).toBe('#ff0000');
  expect(wide.querySelector('[data-pictured]')).toBeNull();
});

it('shows four hues two by two in a one-cell palette, and its ordinary chips from two cells up', () => {
  const one = mountPart('color:palette').host;
  const two = mountPart('color:palette', { span: { columns: 2, rows: 1 } }).host;
  const chips = one.querySelectorAll<HTMLButtonElement>('button');

  expect(chips).toHaveLength(4);
  expect(new Set([...chips].map((chip) => chip.style.background)).size).toBe(4);
  expect(two.querySelector('button')!.style.background).toBe('rgb(0, 0, 0)');
});

it('marks an empty color history with a clock turned back, and only while it is empty', () => {
  const { host, services } = mountPart('color:history');

  expect(host.querySelectorAll('svg')).toHaveLength(1);
  services.color.recent.remember('#00ff00');
  flush();
  expect(host.querySelector('svg')).toBeNull();
  expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('#00ff00');
});

it('shows a "rename" glyph in place of a layer name that does not fit, and the name where it fits', () => {
  const narrow = mountPart('layers:name').host;
  const wide = mountPart('layers:name', { span: { columns: 6, rows: 1 } }).host;

  expect(narrow.querySelector('[data-pictured] svg')).not.toBeNull();
  expect(narrow.querySelector('input')!.value).toBe(wide.querySelector('input')!.value);
  expect(wide.querySelector('[data-pictured]')).toBeNull();
  expect(wide.querySelector('svg')).toBeNull();
});

it('rings the two circles of a compact blend preview, and not a named one', () => {
  const narrow = mountPart('layers:blend').host;
  const wide = mountPart('layers:blend', { span: { columns: 5, rows: 1 } }).host;

  expect(narrow.querySelector('[data-compact] canvas')).not.toBeNull();
  expect(narrow.querySelectorAll('[data-compact] > svg circle')).toHaveLength(2);
  expect(wide.querySelector('[data-compact]')).toBeNull();
  expect(wide.textContent).toContain('Normal');
});

it('opens the whole layer list from a one-cell list, and lists the rows from two cells', () => {
  const onPopup = vi.fn();
  const one = mountPart('layers:list', { onPopup }).host;
  const two = mountPart('layers:list', { span: { columns: 2, rows: 3 } }).host;

  one.querySelector<HTMLButtonElement>('button[aria-label="Layer list"]')!.click();
  expect(onPopup).toHaveBeenCalledWith(expect.any(Element), { kind: 'part', partKind: 'layers:list' });
  expect(two.querySelector('[data-narrow]')).not.toBeNull();
});

it.each([
  ['layer:lock', 'alphaLock'],
  ['layer:clip', 'clipping'],
  ['layers:smooth-color', 'linearBlending']
] as const)('shows %s on and off differently', (kind, setting) => {
  const { services } = createServices();
  const initial = services.layers.state();
  const [state, setState] = createSignal<DocumentState>(initial);
  services.layers.state = state;
  const { host } = mountPart(kind, { services });
  const set = (on: boolean) => {
    setState(
      setting === 'linearBlending'
        ? { ...initial, linearBlending: on }
        : { ...initial, layers: initial.layers.map((layer) => ({ ...layer, [setting]: on })) }
    );
    flush();
    return { pressed: host.querySelector('button')!.getAttribute('aria-pressed'), face: face(host) };
  };

  const off = set(false);
  const on = set(true);
  expect(off.pressed).toBe('false');
  expect(on.pressed).toBe('true');
  if (kind !== 'layer:clip') {
    // Lock draws its padlock shut or open, Smooth color mixes its chip in linear light or in sRGB.
    expect(on.face).not.toBe(off.face);
  }
});

/**
 * What a part's face shows, without its accessible names: the shapes of its glyphs, its visible text and the colors it
 * paints, each in document order. Lists and fields count only through what they show, not their options or values.
 */
function face(host: Element) {
  const shown: string[] = [];
  for (const element of host.querySelectorAll('*')) {
    if (element.closest('select, option')) {
      continue;
    }

    if (element instanceof SVGElement && !(element instanceof SVGSVGElement)) {
      shown.push(
        `${element.tagName}(${['d', 'cx', 'cy', 'r', 'width', 'height', 'fill']
          .map((name) => element.getAttribute(name) ?? '')
          .join(',')})${element.closest('[data-unlit]') ? ':unlit' : ''}`
      );
    } else if (element instanceof HTMLElement) {
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent!.trim())
        .join('');
      const paint = [element.style.background, element.style.getPropertyValue('--hex-color')].filter(Boolean);
      const marks = ['data-linear', 'data-pictured', 'data-compact', 'data-unlit'].filter((name) =>
        element.hasAttribute(name)
      );
      if (own || paint.length || marks.length || element instanceof HTMLCanvasElement) {
        shown.push(`${element.tagName}[${own}|${paint.join(',')}|${marks.join(',')}]`);
      }
    }
  }

  return shown.join(' ');
}

function createServices() {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const created = createTestServices();
    created.services.presets.all = () => [builtInPresets[0]!];
    return created;
  });
}

/** Mounts `kind` live at `span`, one cell by default, on a 28 px grid: the owner's cell with a pen. */
function mountPart(
  kind: string,
  options: {
    span?: Span;
    services?: ReturnType<typeof createTestServices>['services'];
    onPopup?: Parameters<typeof PartFrame>[0]['onPopup'];
  } = {}
) {
  const services = options.services ?? createServices().services;
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <GridContext value={createGrid(() => 28)}>
          <LegoServicesContext value={services}>
            <PartFrame kind={kind} span={options.span ?? { columns: 1, rows: 1 }} onPopup={options.onPopup} />
          </LegoServicesContext>
        </GridContext>
      ),
      host
    )
  );
  flush();
  return { host, services };
}
