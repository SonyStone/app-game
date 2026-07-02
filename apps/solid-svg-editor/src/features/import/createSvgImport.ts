import { createSignal } from 'solid-js';

import { hasSvgDrag } from '../../editor/tree-utils';

export function createSvgImport(options: { readonly importSvgText: (text: string, name: string) => void }) {
  const [isSvgDropActive, setIsSvgDropActive] = createSignal(false);
  let importInputRef: HTMLInputElement | undefined;

  function setImportInputRef(element: HTMLInputElement): void {
    importInputRef = element;
  }

  function openImportDialog(): void {
    importInputRef?.click();
  }

  async function onImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    await importSvgFile(file);
  }

  async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    setIsSvgDropActive(false);

    const transfer = event.dataTransfer;

    if (transfer) {
      await importDroppedSvg(transfer);
    }
  }

  function onDragEnter(event: DragEvent): void {
    if (hasSvgDrag(event)) {
      event.preventDefault();
      setIsSvgDropActive(true);
    }
  }

  function onDragOver(event: DragEvent): void {
    if (!hasSvgDrag(event)) {
      return;
    }

    event.preventDefault();

    const transfer = event.dataTransfer;

    if (transfer) {
      transfer.dropEffect = 'copy';
    }

    setIsSvgDropActive(true);
  }

  function onDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      setIsSvgDropActive(false);
    }
  }

  async function importSvgFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }

    const text = await file.text();
    options.importSvgText(text, file.name);
  }

  async function importDroppedSvg(dataTransfer: DataTransfer): Promise<void> {
    const file = Array.from(dataTransfer.files).find(
      (item) => item.type === 'image/svg+xml' || item.name.toLowerCase().endsWith('.svg')
    );

    if (file) {
      await importSvgFile(file);
      return;
    }

    const text = dataTransfer.getData('text/plain').trim();

    if (text.startsWith('<svg') || text.includes('<svg')) {
      options.importSvgText(text, 'Dropped.svg');
    }
  }

  return {
    isSvgDropActive,
    setImportInputRef,
    openImportDialog,
    onImportFile,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop
  };
}
