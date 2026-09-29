# Reactive state and public contracts

Examples illustrate the stated requirements, not universal syntax rules. Imports and unrelated implementation are omitted. Helper names do not require matching abstractions in another application.

### Reset editable state from its reactive source

Context: an editor remains mounted when its image changes. Zoom and selection reset on a different image ID; a grid preference persists. Replacing the image object or its URL with the same ID should preserve edits. `Rect` is the selection rectangle; `ZoomLevel` and `Percent` are the project's branded numeric types.

**BAD**

An effect coordinates resets of otherwise independent signals:

```tsx
const { zoom, zoomIn, zoomOut, resetZoom } = createZoom();
const [selection, setSelection] = createSignal<Rect>();

createEffect(
  () => props.image.id,
  () => {
    resetZoom();
    setSelection(undefined);
  }
);
```

**GOOD**

State declares its reset dependency. The memo filters changes that retain the same ID:

```tsx
const imageId = createMemo(() => props.image.id);
const { zoom, zoomIn, zoomOut } = createZoom(() => {
  imageId();
  return 1;
});
const [selection, setSelection] = createSignal<Rect | undefined>(() => {
  imageId();
  return undefined;
});
const [showGrid, setShowGrid] = createSignal(false);
```

The zoom factory accepts a value or a reactive source. `access` and `MaybeAccessor` come from `@solid-primitives/utils`:

```tsx
/** Source changes reset local zoom edits; resetZoom explicitly returns to 1. */
function createZoom(initialValue: MaybeAccessor<number> = 1) {
  const [zoom, setZoom] = createSignal(() => access(initialValue) as ZoomLevel);
  const zoomIn = () => setZoom((value) => (value * 1.2) as ZoomLevel);
  const zoomOut = () => setZoom((value) => (value / 1.2) as ZoomLevel);
  const resetZoom = () => setZoom(1 as ZoomLevel);
  const percent = createMemo(() => Math.round(zoom() * 100) as Percent);

  return { zoom, zoomIn, zoomOut, resetZoom, percent };
}
```

Reading `props.image` directly in the signal's source instead ties resets to object replacement. Even reading `props.image.id` directly can track the parent object; the memo creates an equality boundary on the ID. Choose object identity instead when each replacement is intentionally a new session.

See [Solid's avoid-unnecessary-effects guide](https://v2.solidjs.com/guides/avoid-unnecessary-effects) for writable derivations and effect boundaries. Effects remain appropriate for driving imperative systems from reactive state.

### Expose replaceable store collections through projections

Context: a chat connection owns a structured room snapshot. Transport updates and room changes replace its arrays. Callers want to destructure the collections and pass them directly to display components. Connection status and errors can remain scalar signals.

The following snippets belong inside the connection factory:

```tsx
type RoomSnapshot = {
  messages: { id: string; authorName: string; text: string }[];
  participants: { id: string; name: string }[];
};

const [snapshot, setSnapshot] = createStore<RoomSnapshot>({
  messages: [],
  participants: []
});
```

**BAD**

Returning the current branches captures references that do not follow later replacement:

```tsx
return {
  error,
  ready,
  messages: snapshot.messages,
  participants: snapshot.participants,
  send
};
```

**GOOD**

```tsx
const messages = createProjection(() => snapshot.messages, []);
const participants = createProjection(() => snapshot.participants, []);

return { error, ready, messages, participants, send };
```

The caller receives collections, not accessor functions:

```tsx
const { error, ready, messages, participants, send } =
  createConnection(() => props.roomId);

return (
  <>
    <Show when={error()}>{(err) => <p role="alert">{err().message}</p>}</Show>
    <Show when={ready()} fallback={<p>Connecting...</p>}>
      <MessageList messages={messages} />
      <ParticipantList participants={participants} />
      <MessageComposer onSend={send} />
    </Show>
  </>
);
```

`createConnection` owns transport setup, room replacement, cleanup, and updates to the snapshot. `MessageList` and `ParticipantList` only display data; `MessageComposer` owns its draft and invokes `send`. No connection component is required solely because setup and cleanup exist. Use a branded room identifier in the connection API.
