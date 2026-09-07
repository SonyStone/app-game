import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { AbrViewerDialog } from './AbrViewerDialog';

vi.mock('@app-game/abr-viewer/editor', () => ({
  App: () => <input aria-label="Viewer workspace" />
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
  let toggle!: (open: boolean) => void;
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => {
    const [open, setOpen] = createSignal(true, { ownedWrite: true });
    toggle = setOpen;
    return <AbrViewerDialog open={open()} close={() => setOpen(false)} session={{ useAbrBrush: vi.fn() }} />;
  }, host);
  try {
    await vi.waitFor(() => {
      flush();
      expect(host.querySelector('input')).not.toBeNull();
    });
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
  } finally {
    dispose();
    host.remove();
    HTMLDialogElement.prototype.showModal = originalShow;
    HTMLDialogElement.prototype.close = originalClose;
  }
});
