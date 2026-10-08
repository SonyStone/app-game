import { createSignal } from 'solid-js';

/**
 * Accepts files dropped anywhere on an element: spread `handlers` on it; `dragging` is true while files are over it.
 * Drops without files are left to the page.
 */
export function createFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = createSignal(false);
  let depth = 0;
  const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (carriesFiles(event)) {
        event.preventDefault();
        depth++;
        setDragging(true);
      }
    },
    onDragOver(event: DragEvent) {
      if (carriesFiles(event)) {
        event.preventDefault();
      }
    },
    onDragLeave(event: DragEvent) {
      if (carriesFiles(event) && --depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    },
    onDrop(event: DragEvent) {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length) {
        return;
      }

      event.preventDefault();
      depth = 0;
      setDragging(false);
      onFiles(files);
    }
  };

  return { dragging, handlers };
}
