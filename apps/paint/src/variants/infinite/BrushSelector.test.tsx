// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets, type BrushPreset } from '../../features/brush-library';
import { BrushSelector } from './BrushSelector';
import { createBrushFavorites } from './createBrushFavorites';

const ink: BrushPreset = { id: 'ink', name: 'Ink', settings: { size: 3 }, resourceIds: [] };
const chalk: BrushPreset = {
  id: 'chalk',
  name: 'Chalk',
  settings: { size: 40 },
  resourceIds: [],
  source: 'chalks.abr#1'
};
const presets = [...builtInPresets, ink, chalk];
let dispose: (() => void) | undefined;

beforeEach(() => {
  // The sample strokes draw on the next frame, which jsdom's canvas cannot do.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('opens on the current brush’s folder, browses folders and keeps the current brush pinned', () => {
  const { host } = mount({ preset: 'ink', recent: ['chalk', 'ink'] });

  expect(folderNames(host)).toEqual(['Recent', 'Basic', 'Imported', 'My brushes']);
  expect(pressedFolder(host)).toBe('My brushes');
  expect(brushNames(host)).toEqual(['Ink']);
  expect(pinnedName(host)).toBe('Ink');
  expect(option(host, 'Ink').getAttribute('aria-selected')).toBe('true');

  folder(host, 'Imported').click();
  flush();
  expect(pressedFolder(host)).toBe('Imported');
  expect(brushNames(host)).toEqual(['Chalk']);
  expect(pinnedName(host)).toBe('Ink');

  folder(host, 'Recent').click();
  flush();
  expect(brushNames(host)).toEqual(['Chalk', 'Ink']);
  expect(option(host, 'Chalk').getAttribute('aria-selected')).toBe('false');
});

it('chooses a brush without leaving the folder, and the pinned card follows', () => {
  const { host, onChoose } = mount({ preset: 'builtin:soft-round', recent: [] });

  expect(pressedFolder(host)).toBe('Basic');
  option(host, 'Eraser').click();
  flush();
  expect(onChoose).toHaveBeenCalledWith('builtin:eraser');
  expect(pinnedName(host)).toBe('Eraser');
  expect(pressedFolder(host)).toBe('Basic');
  expect(option(host, 'Eraser').getAttribute('aria-selected')).toBe('true');
  expect(option(host, 'Soft round').getAttribute('aria-selected')).toBe('false');
});

it('opens on the given folder, hides absent actions and narrows the folder column to icons', () => {
  const { host } = mount({ preset: 'builtin:soft-round', recent: ['ink'], initialFolder: 'recent' });

  expect(pressedFolder(host)).toBe('Recent');
  expect(host.querySelector('[aria-label="Import brushes"]')).toBeNull();
  expect(host.querySelector('[aria-label="Edit brush"]')).toBeNull();
  expect(host.querySelector('[aria-label="Favorite"]')).toBeNull();

  const iconsOnly = host.querySelector<HTMLButtonElement>('[aria-label="Folder icons only"]')!;
  expect(iconsOnly.getAttribute('aria-pressed')).toBe('false');
  iconsOnly.click();
  flush();
  expect(iconsOnly.getAttribute('aria-pressed')).toBe('true');
  expect(host.firstElementChild!.hasAttribute('data-compact')).toBe(true);
});

it('imports and edits through the header', () => {
  const onImport = vi.fn();
  const onEdit = vi.fn();
  const { host } = mount({ preset: 'ink', recent: [], onImport, onEdit });

  host.querySelector<HTMLButtonElement>('[aria-label="Import brushes"]')!.click();
  host.querySelector<HTMLButtonElement>('[aria-label="Edit brush"]')!.click();
  expect(onImport).toHaveBeenCalledOnce();
  expect(onEdit).toHaveBeenCalledOnce();
});

it('lists hearted brushes in Favorites and remembers them', () => {
  const { host } = mount({ preset: 'ink', recent: ['ink'], favorites: true });

  expect(folderNames(host)).toEqual(['Recent', 'Favorites', 'Basic', 'Imported', 'My brushes']);
  folder(host, 'Favorites').click();
  flush();
  expect(brushNames(host)).toEqual([]);
  expect(host.textContent).toContain('Tap the heart');

  const heart = host.querySelector<HTMLButtonElement>('[aria-label="Favorite"]')!;
  heart.click();
  flush();
  expect(heart.getAttribute('aria-pressed')).toBe('true');
  expect(brushNames(host)).toEqual(['Ink']);
  expect(JSON.parse(localStorage.getItem('paint.infinite.favorites')!)).toEqual(['ink']);

  heart.click();
  flush();
  expect(brushNames(host)).toEqual([]);
  expect(JSON.parse(localStorage.getItem('paint.infinite.favorites')!)).toEqual([]);
});

function mount(options: {
  preset: string;
  recent: string[];
  initialFolder?: 'recent';
  favorites?: boolean;
  onImport?: () => void;
  onEdit?: () => void;
}) {
  const onChoose = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => {
    const [preset, setPreset] = createSignal(options.preset);
    const { favorites, toggle } = createBrushFavorites();
    return (
      <BrushSelector
        presets={presets}
        recent={options.recent}
        preset={preset()}
        initialFolder={options.initialFolder}
        favorites={favorites()}
        onFavorite={options.favorites ? toggle : undefined}
        onChoose={(id) => {
          onChoose(id);
          setPreset(id);
        }}
        onImport={options.onImport}
        onEdit={options.onEdit}
      />
    );
  }, host);
  flush();
  return { host, onChoose };
}

function folders(host: HTMLElement) {
  return [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Brush folders"] button')];
}

function folderNames(host: HTMLElement) {
  return folders(host).map((button) => button.getAttribute('aria-label'));
}

function folder(host: HTMLElement, name: string) {
  return folders(host).find((button) => button.getAttribute('aria-label') === name)!;
}

function pressedFolder(host: HTMLElement) {
  return folders(host)
    .find((button) => button.getAttribute('aria-pressed') === 'true')
    ?.getAttribute('aria-label');
}

function options(host: HTMLElement) {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')];
}

function brushNames(host: HTMLElement) {
  return options(host).map((button) => button.getAttribute('aria-label'));
}

function option(host: HTMLElement, name: string) {
  return options(host).find((button) => button.getAttribute('aria-label') === name)!;
}

function pinnedName(host: HTMLElement) {
  return host.querySelector('[aria-label="Current brush"]')?.textContent;
}
