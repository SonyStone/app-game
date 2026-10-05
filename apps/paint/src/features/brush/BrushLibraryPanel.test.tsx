// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { builtInPresets, type BrushPreset } from '../brush-library';
import { BrushLibraryPanel } from './BrushLibraryPanel';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

it('chooses presets, marks changes, saves as new with chosen groups and confirms deletion', () => {
  const actions = {
    onSelect: vi.fn(),
    onReset: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn()
  };
  const host = mount(actions, (id) => id === 'ink');
  const button = (name: string) =>
    [...host.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim().startsWith(name))!;

  const tiles = host.querySelectorAll('[aria-label="Brush presets"] button');
  expect([...tiles].map((tile) => tile.textContent)).toEqual(['RoundSoft round', 'EraserEraser', 'ABRInk']);
  expect(tiles[2]!.getAttribute('aria-pressed')).toBe('true');
  expect(tiles[2]!.querySelector('[aria-label="changed"]')).not.toBeNull();
  (tiles[0] as HTMLButtonElement).click();
  expect(actions.onSelect).toHaveBeenCalledWith('builtin:soft-round');

  expect(button('Save').disabled).toBe(false);
  button('Reset').click();
  expect(actions.onReset).toHaveBeenCalledWith('ink');

  button('Save as').click();
  flush();
  const name = host.querySelector<HTMLInputElement>('[aria-label="Preset name"]')!;
  expect(name.value).toBe('Ink copy');
  const colors = [...host.querySelectorAll('label')].find((label) => label.textContent === 'Colors')!;
  colors.querySelector('input')!.click();
  flush();
  button('Save preset').click();
  expect(actions.onSaveAs).toHaveBeenCalledWith('Ink copy', ['tip', 'size', 'opacity', 'stroke', 'mixing', 'color']);

  button('Delete').click();
  flush();
  expect(actions.onDelete).not.toHaveBeenCalled();
  button('Delete “Ink”').click();
  expect(actions.onDelete).toHaveBeenCalledWith('ink');
});

function mount(actions: Record<string, () => void>, changed: (id: string) => boolean) {
  const ink: BrushPreset = {
    id: 'ink',
    name: 'Ink',
    settings: { engine: { id: 'abr', settings: {} }, tool: 'brush' },
    resourceIds: []
  };
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(
    () => (
      <BrushLibraryPanel
        presets={[...builtInPresets, ink]}
        preset="ink"
        changed={changed}
        brush={defaultBrush()}
        disabled={false}
        onChange={() => {}}
        onSelect={actions.onSelect!}
        onReset={actions.onReset!}
        onSave={actions.onSave!}
        onSaveAs={actions.onSaveAs!}
        onRename={actions.onRename!}
        onDelete={actions.onDelete!}
        sharedSize={false}
        onSharedSizeChange={() => {}}
      />
    ),
    host
  );
  flush();
  cleanup = () => {
    dispose();
    host.remove();
  };
  return host;
}
