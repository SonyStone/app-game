// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { builtInPresets, type BrushPreset } from '../../features/brush-library';
import { LegoServicesContext } from '../lego/LegoServices';
import { PartFrame } from '../lego/PartFrame';
import { createTestServices } from '../lego/testServices';
import { BrushLibrary } from './BrushLibrary';

vi.mock('@app-game/paint-core/preview/client', () => ({
  attachStrokePreview: () => ({ update: vi.fn(), pause: vi.fn(), dispose: vi.fn() })
}));

const disposers: (() => void)[] = [];
beforeEach(() => {
  for (const name of ['IntersectionObserver', 'ResizeObserver']) {
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  flush();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const [soft] = builtInPresets;
const one: BrushPreset = { id: 'one', name: 'Soft round 2', settings: defaultBrush(), resourceIds: [] };
const two: BrushPreset = { id: 'two', name: 'Soft round 3', settings: defaultBrush(), resourceIds: [] };
const imported: BrushPreset = { ...one, id: 'abr', name: 'Charcoal', source: 'set.abr#0' };

it('offers Rename and Delete only on the own brush in use, never on a built-in one or without `own`', () => {
  const [preset, setPreset] = createSignal(soft!.id);
  const own = ownActions();
  mount(() => (
    <BrushLibrary
      title="Brushes"
      sidebar
      presets={[soft!, one, two, imported]}
      recent={[]}
      preset={preset()}
      disabled={false}
      onChoose={setPreset}
      own={own}
    />
  ));
  expect(actions()).toEqual([]);

  setPreset(two.id);
  flush();
  expect(actions()).toEqual(['Soft round 3 actions']);
  // Choosing stays one press on the row itself.
  options()
    .find((option) => option.textContent === 'Soft round 2')!
    .click();
  flush();
  expect(preset()).toBe(one.id);
  expect(actions()).toEqual(['Soft round 2 actions']);

  // Imported Photoshop brushes are the user's own too.
  setPreset(imported.id);
  flush();
  expect(actions()).toEqual(['Charcoal actions']);

  document.body.replaceChildren();
  mount(() => (
    <BrushLibrary
      title="Brush Library"
      presets={[soft!, one]}
      recent={[]}
      preset={one.id}
      disabled={false}
      onChoose={vi.fn()}
    />
  ));
  // Procreate's look: each brush a plain option button, nothing else on its row.
  expect(actions()).toEqual([]);
  expect(options().map((option) => option.tagName)).toEqual(['BUTTON']);
  expect(document.querySelector('[aria-label="Rename brush"], [aria-label="Delete brush"]')).toBeNull();
});

it('renames in place: the name selected, a blank name refused, Escape ending only the renaming, Enter confirming', () => {
  const own = ownActions();
  // The editor closes its popup on an Escape that reaches the window.
  const closePanel = vi.fn();
  const listen = (event: KeyboardEvent) => event.key === 'Escape' && closePanel();
  window.addEventListener('keydown', listen);
  disposers.push(() => window.removeEventListener('keydown', listen));
  mount(() => (
    <BrushLibrary
      title="Brushes"
      sidebar
      presets={[one, two]}
      recent={[]}
      preset={one.id}
      disabled={false}
      onChoose={vi.fn()}
      own={own}
    />
  ));
  press('Rename brush');
  const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Brush name"]');
  expect(field()!.value).toBe('Soft round 2');
  expect(document.activeElement).toBe(field());
  expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([0, 'Soft round 2'.length]);
  expect(actions()).toEqual([]);

  type('  ');
  expect(button('Confirm name').disabled).toBe(true);
  key('Enter');
  expect(own.rename).not.toHaveBeenCalled();

  key('Escape');
  expect(field()).toBeNull();
  expect(closePanel).not.toHaveBeenCalled();
  expect(options().map((option) => option.textContent)).toEqual(['Soft round 2', 'Soft round 3']);

  press('Rename brush');
  type(' Wet ink ');
  key('Enter');
  expect(own.rename).toHaveBeenCalledWith(one.id, 'Wet ink');
  expect(field()).toBeNull();

  press('Rename brush');
  type('Dry ink');
  press('Confirm name');
  expect(own.rename).toHaveBeenLastCalledWith(one.id, 'Dry ink');
});

it('deletes with the next brush to use, shows Undo in place of the row, and leaves it out of the count', () => {
  const own = ownActions();
  const [preset, setPreset] = createSignal(one.id);
  const [deleting, setDeleting] = createSignal<ReadonlyMap<string, number>>(new Map());
  mount(() => (
    <BrushLibrary
      title="Brushes"
      sidebar
      presets={[one, two]}
      recent={[]}
      preset={preset()}
      disabled={false}
      onChoose={setPreset}
      own={{
        ...own,
        get deleting() {
          return deleting();
        }
      }}
    />
  ));
  press('Delete brush');
  expect(own.remove).toHaveBeenLastCalledWith(one.id, two.id);

  setDeleting(new Map([[one.id, Date.now() + 5000]]));
  setPreset(two.id);
  flush();
  expect(document.querySelector('[aria-label="Soft round 2 deleted"]')).not.toBeNull();
  expect(options().map((option) => option.textContent)).toEqual(['Soft round 3']);
  expect(document.querySelector('[data-item="mine"]')!.textContent).toContain('1');
  // The last brush left moves to the one before, here none but the brush being deleted.
  press('Delete brush');
  expect(own.remove).toHaveBeenLastCalledWith(two.id, undefined);

  press('Undo delete');
  expect(own.undo).toHaveBeenCalledWith(one.id);
});

it("wires LEGO's library to the services' own brushes and lists brushes being deleted", () => {
  const { services } = owned(createTestServices);
  const [deleting, setDeleting] = createSignal<ReadonlyMap<string, number>>(new Map());
  services.tools.preset = createSignal(two.id)[0];
  services.presets.listed = () => [one, two];
  services.presets.all = () => [two];
  services.presets.own.deleting = deleting;
  mount(() => (
    <LegoServicesContext value={services}>
      <PartFrame kind="action:brushes" popup />
    </LegoServicesContext>
  ));
  setDeleting(new Map([[one.id, Date.now() + 5000]]));
  flush();
  expect(document.querySelector('[aria-label="Soft round 2 deleted"]')).not.toBeNull();

  press('Delete brush');
  expect(services.presets.own.remove).toHaveBeenCalledWith(two.id, undefined);
  press('Undo delete');
  expect(services.presets.own.undo).toHaveBeenCalledWith(one.id);
  press('Rename brush');
  type('Wet ink');
  key('Enter');
  expect(services.presets.own.rename).toHaveBeenCalledWith(two.id, 'Wet ink');
});

function ownActions() {
  return { deleting: new Map<string, number>(), rename: vi.fn(), remove: vi.fn(), undo: vi.fn() };
}

function options() {
  return [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
}

function actions() {
  return [...document.querySelectorAll('[role="listbox"] [role="group"][aria-label$=" actions"]')].map((group) =>
    group.getAttribute('aria-label')
  );
}

function button(label: string) {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

function press(label: string) {
  button(label).click();
  flush();
}

function type(text: string) {
  const field = document.querySelector<HTMLInputElement>('input[aria-label="Brush name"]')!;
  field.value = text;
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
  flush();
}

function key(name: string) {
  document
    .querySelector('input[aria-label="Brush name"]')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  flush();
}

function owned<T>(create: () => T) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
}

function mount(view: Parameters<typeof render>[0]) {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(view, host));
  flush();
}
