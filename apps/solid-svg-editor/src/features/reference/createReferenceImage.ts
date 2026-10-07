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

  /**
   * GodSVG's "Paste reference image": uses the first image on the clipboard. Resolves `false` when the clipboard has
   * none or can't be read.
   */
  async function pasteReferenceImage(): Promise<boolean> {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((candidate) => candidate.startsWith('image/'));

        if (type) {
          clearReference();
          setReferenceImage(URL.createObjectURL(await item.getType(type)));
          setShowReference(true);
          return true;
        }
      }
    } catch {
      // Permission denied or no clipboard access.
    }

    return false;
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
    pasteReferenceImage,
    clearReference
  };
}
