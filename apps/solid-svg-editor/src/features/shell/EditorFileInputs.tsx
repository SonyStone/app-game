export function EditorFileInputs(props: {
  readonly setImportInputRef: (element: HTMLInputElement) => void;
  readonly onImportFile: (event: Event) => void;
  readonly setReferenceInputRef: (element: HTMLInputElement) => void;
  readonly onReferenceFile: (event: Event) => void;
}) {
  return (
    <>
      <input
        ref={props.setImportInputRef}
        class="hidden-input pointer-events-none absolute h-px w-px opacity-0"
        type="file"
        name="svg-import"
        aria-label="Import SVG"
        data-testid="svg-import-input"
        accept=".svg,image/svg+xml,text/xml"
        onChange={props.onImportFile}
      />
      <input
        ref={props.setReferenceInputRef}
        class="hidden-input pointer-events-none absolute h-px w-px opacity-0"
        type="file"
        name="reference-import"
        aria-label="Import reference image"
        data-testid="reference-import-input"
        accept="image/*"
        onChange={props.onReferenceFile}
      />
    </>
  );
}
