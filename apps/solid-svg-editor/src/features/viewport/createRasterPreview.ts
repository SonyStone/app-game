import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';

export function createRasterPreview(options: { readonly enabled: Accessor<boolean>; readonly text: Accessor<string> }) {
  const [rasterPreviewUrl, setRasterPreviewUrl] = createSignal<string | undefined>();
  let rasterPreviewObjectUrl: string | undefined;

  function clearRasterPreview(): void {
    if (rasterPreviewObjectUrl) {
      URL.revokeObjectURL(rasterPreviewObjectUrl);
      rasterPreviewObjectUrl = undefined;
    }

    setRasterPreviewUrl(undefined);
  }

  createEffect(() => {
    if (!options.enabled()) {
      clearRasterPreview();
      return;
    }

    const nextUrl = URL.createObjectURL(new Blob([options.text()], { type: 'image/svg+xml' }));
    const previousUrl = rasterPreviewObjectUrl;
    rasterPreviewObjectUrl = nextUrl;
    setRasterPreviewUrl(nextUrl);

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  });

  onCleanup(clearRasterPreview);

  return rasterPreviewUrl;
}
