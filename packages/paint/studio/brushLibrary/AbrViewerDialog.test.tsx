import type { App } from '@app-game/abr-viewer/editor';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { defaultBrush, type Brush } from '../brush';
import { AbrViewerDialog } from './AbrViewerDialog';

vi.mock('@app-game/abr-viewer/editor', () => ({
  App: (props: Parameters<typeof App>[0]) => (
    <>
      <input aria-label="Viewer workspace" />
      <button
        data-mixing
        onClick={() => props?.colorMixing?.onChange(props.colorMixing.value === 'linear' ? 'classic' : 'linear')}
      >
        {props?.colorMixing?.value}
      </button>
    </>
  )
}));

it('closes and reopens the same viewer workspace without remounting it', async () => {
  const originalShow = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let changeBrush!: (brush: Brush) => void;
  let toggle!: (open: boolean) => void;
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => {
    const [open, setOpen] = createSignal(true, { ownedWrite: true });
    toggle = setOpen;
    const [brush, setBrush] = createSignal(defaultBrush(), { ownedWrite: true });
    changeBrush = setBrush;
    return (
      <AbrViewerDialog
        open={open()}
        close={() => setOpen(false)}
        session={{ useAbrBrush: vi.fn(), brush, updateBrush: (patch) => setBrush({ ...brush(), ...patch }) }}
      />
    );
  }, host);
  try {
    await vi.waitFor(() => {
      flush();
      expect(host.querySelector('input')).not.toBeNull();
    });
    const mixing = host.querySelector<HTMLButtonElement>('[data-mixing]')!;
    expect(mixing.textContent).toBe('linear');
    mixing.click();
    flush();
    expect(mixing.textContent).toBe('classic');
    changeBrush(defaultBrush());
    flush();
    expect(mixing.textContent).toBe('linear');
    const input = host.querySelector('input')!;
    input.value = 'Imported and edited brush';
    expect(host.querySelector('dialog')!.open).toBe(true);
    host.querySelector('button')!.click();
    flush();
    expect(host.querySelector('dialog')!.open).toBe(false);
    toggle(true);
    flush();
    expect(host.querySelector('dialog')!.open).toBe(true);
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('Imported and edited brush');
    expect(mixing.textContent).toBe('linear');
  } finally {
    dispose();
    host.remove();
    HTMLDialogElement.prototype.showModal = originalShow;
    HTMLDialogElement.prototype.close = originalClose;
  }
});
