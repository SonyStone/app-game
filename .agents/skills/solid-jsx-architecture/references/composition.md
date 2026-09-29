# Composition and factories

Examples illustrate the stated requirements, not universal syntax rules. Imports and unrelated implementation are omitted. Helper names do not require matching abstractions in another application.

### Extract an operation, keep the screen composition

Context: one image viewer has zoom buttons and a percentage display. Their grouping has no independent interaction behavior. Zooming has its own commands, step size, and derived percentage.

**BAD**

The viewer owns zoom state, while a toolbar component hides the markup and implements zoom arithmetic through a setter.

```tsx
function ImageViewer(props: { src: string }) {
  const [zoom, setZoom] = createSignal(1);

  return (
    <section>
      <img src={props.src} style={{ transform: `scale(${zoom()})` }} />
      <ZoomToolbar zoom={zoom()} onZoomChange={setZoom} />
    </section>
  );
}

function ZoomToolbar(props: { zoom: number; onZoomChange: (zoom: number) => void }) {
  return (
    <nav aria-label="Zoom">
      <button onClick={() => props.onZoomChange(props.zoom / 1.2)}>Out</button>
      <output>{Math.round(props.zoom * 100)}%</output>
      <button onClick={() => props.onZoomChange(props.zoom * 1.2)}>In</button>
      <button onClick={() => props.onZoomChange(1)}>Reset</button>
    </nav>
  );
}
```

**GOOD**

```tsx
function ImageViewer(props: { src: string }) {
  const { zoom, zoomIn, zoomOut, resetZoom, percent } = createZoom();

  return (
    <section>
      <img src={props.src} style={{ transform: `scale(${zoom()})` }} />
      <nav aria-label="Zoom">
        <button onClick={zoomOut}>Out</button>
        <output>{percent()}%</output>
        <button onClick={zoomIn}>In</button>
        <button onClick={resetZoom}>Reset</button>
      </nav>
    </section>
  );
}

/** Owns zoom commands and display values for the caller's lifetime. */
function createZoom() {
  const [zoom, setZoom] = createSignal(1);
  const zoomIn = () => setZoom((value) => value * 1.2);
  const zoomOut = () => setZoom((value) => value / 1.2);
  const resetZoom = () => setZoom(1);
  const percent = createMemo(() => Math.round(zoom() * 100));

  return { zoom, zoomIn, zoomOut, resetZoom, percent };
}
```

The useful extraction is the zoom operation, even though it is small. Branded zoom and percentage types can refine this API according to the project's conventions; their construction is omitted here.

### Expose placement while owning behavior

Context: a menu can replace its main contents with language choices. The language component owns switching, keyboard handling, and focus return. Main-menu actions differ between callers.

**BAD**

```tsx
<LanguageMenu onSave={save} onPreview={preview} showPreview={true} />
```

The component internally chooses the main actions. Adding an action requires editing its API and implementation.

**GOOD**

```tsx
<LanguageMenu>
  {(languageTrigger) => (
    <>
      <button onClick={save}>Save</button>
      {languageTrigger}
      <button onClick={preview}>Preview</button>
    </>
  )}
</LanguageMenu>
```

The render prop provides a trigger element with its behavior attached. The caller chooses placement and surrounding content. This is a composition decision, not a component created just to expose local state.
