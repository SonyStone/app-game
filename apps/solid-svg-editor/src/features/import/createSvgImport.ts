import { createSignal } from 'solid-js';

import { hasSvgDrag } from '../../editor/tree-utils';

/**
 * SVG import through the file input and drag and drop. Dropped SVG files are opened with their file handles where the
 * browser provides them (so tabs stay bound to the files), otherwise as text; dropped SVG markup opens as `Dropped.svg`.
 */
export function createSvgImport(options: {
  readonly importSvgText: (text: string, name: string) => void;
  /** Opens dropped files that come with File System Access handles. */
  readonly openHandles: (handles: readonly FileSystemFileHandle[]) => Promise<void>;
}) {
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
    const files = Array.from(input.files ?? []);
    input.value = '';

    for (const file of files) {
      await importSvgFile(file);
    }
  }

  async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    setIsSvgDropActive(false);

    const transfer = event.dataTransfer;

    if (!transfer) {
      return;
    }

    // Handles must be requested during the drop event, before anything is awaited.
    const svgItems = Array.from(transfer.items).filter((item) => item.kind === 'file' && isSvgFile(item.getAsFile()));
    const handleRequests = svgItems.map((item) => (item as HandleDataTransferItem).getAsFileSystemHandle?.());

    if (svgItems.length > 0 && handleRequests.every((request) => request !== undefined)) {
      const handles = (await Promise.all(handleRequests)).filter((handle): handle is FileSystemFileHandle => handle?.kind === 'file');
      await options.openHandles(handles);
      return;
    }

    await importDroppedSvg(transfer);
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
    const files = Array.from(dataTransfer.files).filter(isSvgFile);

    if (files.length > 0) {
      for (const file of files) {
        await importSvgFile(file);
      }

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

function isSvgFile(file: File | null): file is File {
  return file !== null && (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'));
}

/** Chromium's drag item with File System Access support. */
type HandleDataTransferItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
