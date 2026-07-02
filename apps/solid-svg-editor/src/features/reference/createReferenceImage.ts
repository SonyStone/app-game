import { createSignal, onCleanup } from 'solid-js';

export function createReferenceImage() {
  const [referenceImage, setReferenceImage] = createSignal<string | undefined>();
  const [showReference, setShowReference] = createSignal(true);
  const [overlayReference, setOverlayReference] = createSignal(false);
  let referenceInputRef: HTMLInputElement | undefined;

  function setReferenceInputRef(element: HTMLInputElement): void {
    referenceInputRef = element;
  }

  function openReferenceDialog(): void {
    referenceInputRef?.click();
  }

  function clearReference(): void {
    const current = referenceImage();

    if (current) {
      URL.revokeObjectURL(current);
    }

    setReferenceImage(undefined);
  }

  function onReferenceFile(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    clearReference();
    setReferenceImage(URL.createObjectURL(file));
    setShowReference(true);
  }

  onCleanup(clearReference);

  return {
    referenceImage,
    showReference,
    setShowReference,
    overlayReference,
    setOverlayReference,
    setReferenceInputRef,
    openReferenceDialog,
    onReferenceFile,
    clearReference
  };
}
