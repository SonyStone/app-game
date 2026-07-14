import { Show } from 'solid-js';

import type { EditorKernel } from '../../editor/kernel';

export function EditorFileInputs<TPanelContext>(props: { readonly kernel: EditorKernel<TPanelContext> }) {
  const svgImport = () => props.kernel.ui.svgImport;
  const referenceImage = () => props.kernel.ui.referenceImage;

  return (
    <>
      <Show when={svgImport()}>
        {(service) => (
          <input
            ref={service().setInputRef}
            class="hidden-input pointer-events-none absolute h-px w-px opacity-0"
            type="file"
            name="svg-import"
            aria-label="Import SVG"
            data-testid="svg-import-input"
            accept=".svg,image/svg+xml,text/xml"
            onChange={(event) => void service().onFile(event)}
          />
        )}
      </Show>
      <Show when={referenceImage()}>
        {(service) => (
          <input
            ref={service().setInputRef}
            class="hidden-input pointer-events-none absolute h-px w-px opacity-0"
            type="file"
            name="reference-import"
            aria-label="Import reference image"
            data-testid="reference-import-input"
            accept="image/*"
            onChange={service().onFile}
          />
        )}
      </Show>
    </>
  );
}
