import { createNativeDroppable } from '@solid-primitives/drag-drop';
import { createSignal } from 'solid-js';

/** Receives one local PDF/GDOC without navigating away; invalid drops leave the document intact. */
export function createDocumentDrop(open: (file: File) => void) {
  const [error, setError] = createSignal<'dropUnsupported' | 'dropMultiple'>();
  const drop = createNativeDroppable({
    accept: (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files'),
    onEnter: (event) => {
      event.preventDefault();
      setError(undefined);
    },
    onOver: (event) => {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (event) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length !== 1) {
        setError(files.length > 1 ? 'dropMultiple' : 'dropUnsupported');
        return;
      }
      const file = files[0]!;
      if (!/\.(pdf|gdoc)$/i.test(file.name) && file.type !== 'application/pdf') {
        setError('dropUnsupported');
        return;
      }
      setError(undefined);
      open(file);
    }
  });
  return { ...drop, error, clearError: () => setError(undefined) };
}
