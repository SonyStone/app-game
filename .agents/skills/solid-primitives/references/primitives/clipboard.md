# @solid-primitives/clipboard

Source version: `2.0.0-next.18`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/clipboard/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitives for reading and writing to the [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API).

- [`readClipboard`](clipboard.md#readclipboard) - One-shot async read of clipboard items.
- [`writeClipboard`](clipboard.md#writeclipboard) - One-shot async write to the clipboard.
- [`createClipboard`](clipboard.md#createclipboard) - Reactive clipboard backed by an async memo. Reads on demand, writes reactively from a signal.
- [`copyToClipboard`](clipboard.md#copytoclipboard) - `ref` directive factory that copies an element's value to clipboard on click.

## Installation

```bash
npm install @solid-primitives/clipboard
# or
yarn add @solid-primitives/clipboard
# or
pnpm add @solid-primitives/clipboard
```

## `readClipboard`

One-shot async read that returns a `Promise<ClipboardItem[]>`.

```ts
import { readClipboard } from "@solid-primitives/clipboard";

const items = await readClipboard();
```

## `writeClipboard`

One-shot async write. Accepts a string or `ClipboardItem[]`.

```ts
import { writeClipboard } from "@solid-primitives/clipboard";

await writeClipboard("Hello World");

await writeClipboard([
  new ClipboardItem({
    "text/plain": new Blob(["Hello World"], { type: "text/plain" }),
  }),
]);
```

## `createClipboard`

Reactive primitive backed by a Solid 2.0 async memo.

```ts
const [clipboard, refetch, write] = createClipboard(optionalSignal?, deferInitial?);
```

- `clipboard()` — `Accessor<ClipboardResourceItem[]>`. Starts as `[]` synchronously (no initial suspension). After `refetch()`, resolves asynchronously; the previous value stays visible while pending.
- `refetch()` — trigger a fresh clipboard read.
- `write` — same as `writeClipboard`.

Automatically calls `refetch()` on the native `clipboardchange` event.

When an optional data signal is passed, its value is written to the clipboard on every change. The initial write is deferred by default (`deferInitial` defaults to `true`).

```tsx
import { createSignal } from "solid-js";
import { createClipboard } from "@solid-primitives/clipboard";

const [data, setData] = createSignal("Hello");
const [clipboard, refetch] = createClipboard(data);

setData("World"); // writes "World" to clipboard

refetch(); // reads clipboard into clipboard()

return (
  <For each={clipboard()}>
    {item => (
      <Switch>
        <Match when={item.type === "text/plain"}>{item.text}</Match>
        <Match when={item.type === "image/png"}>
          <img src={URL.createObjectURL(item.blob)} />
        </Match>
      </Switch>
    )}
  </For>
);
```

No `<Suspense>` needed — `clipboard()` never suspends before the first `refetch()`. If you want a loading indicator during a read, use `isPending`:

```tsx
import { isPending } from "solid-js";

<p>{isPending(() => clipboard()) ? "Reading…" : `${clipboard().length} items`}</p>;
```

## `copyToClipboard`

A `ref` directive factory that writes an element's value to clipboard on click. On `<input>`/`<textarea>` elements it captures `.value`; on any other element it captures `.innerHTML`. Both can be overridden via `options.value`.

```tsx
import { copyToClipboard } from "@solid-primitives/clipboard";

// Copies input value on click
<input type="text" ref={copyToClipboard()} />

// With explicit value
<button ref={copyToClipboard({ value: "copy me" })}>Copy</button>

// With reactive options
<button ref={copyToClipboard(() => ({ value: text() }))}>Copy</button>
```

### Highlighters / range selection

```tsx
import { copyToClipboard, input, element } from "@solid-primitives/clipboard";

<input type="text" ref={copyToClipboard({ highlight: input() })} />
<div ref={copyToClipboard({ highlight: element(5, 10) })} />
```

## `newClipboardItem`

Helper for creating `ClipboardItem` objects. `newItem` is a deprecated alias.

```ts
import { newClipboardItem } from "@solid-primitives/clipboard";

writeClipboard([newClipboardItem("image/png", await image.blob())]);
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/clipboard/CHANGELOG.md)
