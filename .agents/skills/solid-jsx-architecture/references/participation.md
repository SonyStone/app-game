# Participation and lifetime

Examples illustrate the stated requirements, not universal syntax rules. Imports and unrelated implementation are omitted. Helper names do not require matching abstractions in another application.

### Derive a replaceable target from persistent intent

Context: wheel zoom can be enabled or disabled. The image element can be replaced while that choice remains enabled. The wheel listener must be non-passive so it can call `preventDefault`.

**BAD**

Capturing the current image only when the checkbox changes leaves the binding on the old element after replacement:

```tsx
const [wheelTarget, setWheelTarget] = createSignal<HTMLImageElement>();

<input
  type="checkbox"
  checked={wheelTarget() !== undefined}
  onChange={(event) => setWheelTarget(event.currentTarget.checked ? image() : undefined)}
/>;
```

This target-only state is sufficient when the chosen element itself represents the user's selection. It does not encode persistent enablement across replacement.

**GOOD**

Inside the viewer, keep the user's choice and derive the binding target:

```tsx
import { createEventListener } from '@solid-primitives/event-listener';
import { Ref } from '@solid-primitives/refs';

const { zoom, zoomIn, zoomOut } = createZoom();
const [image, setImage] = createSignal<Element>();
const [wheelEnabled, setWheelEnabled] = createSignal(false);
const wheelTarget = createMemo(() => (wheelEnabled() ? image() : undefined));

createEventListener<{ wheel: WheelEvent }>(
  wheelTarget,
  'wheel',
  (event) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  },
  { passive: false }
);

return (
  <section>
    <input
      type="checkbox"
      checked={wheelEnabled()}
      onChange={(event) => setWheelEnabled(event.currentTarget.checked)}
    />
    <Ref ref={setImage}>
      <Show when={props.src} keyed>
        {(src) => (
          <img src={src} style={{ transform: `scale(${zoom()})` }} />
        )}
      </Show>
    </Ref>
  </section>
);
```

`Ref` from `@solid-primitives/refs` reports the current child element or `undefined` when absent. `createEventListener` accepts an accessor target: it removes listeners from the previous target when the accessor changes, attaches nothing for `undefined`, and removes everything on disposal. The explicit `{ wheel: WheelEvent }` event map is needed because `Element`'s event map has no `wheel` entry. The application keeps the wheel-to-zoom decision beside the target choice. `<Show>` around the listener setup is another valid lifetime boundary; it is unnecessary when target absence already expresses detachment.
