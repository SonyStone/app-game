# @solid-primitives/selection

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/selection/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitive that helps reactively reading/setting cursor position and selections both in text fields and contenteditable elements.

## Installation

```bash
npm install @solid-primitives/selection
# or
yarn add @solid-primitives/selection
# or
pnpm add @solid-primitives/selection
```

**Requires**: `solid-js@^2.0.0-beta.10` and `@solidjs/web@^2.0.0-beta.10`

## Usage

The format of the getter output and setter input is `HTMLSelection`, consisting of a tuple of the node in which the selection happens and a start and end offset within the text content. The offsets count from zero, so `1` would be the second character.

```ts
import { createSelection } from "@solid-primitives/selection";

const [selection, setSelection] = createSelection();

// nothing is selected:
selection(); // [null, NaN, NaN]

// select the second to fourth letter inside a contentEditable div:
setSelection([document.querySelector("div[contenteditable]"), 1, 3]);
selection(); // [HTMLDivElement, 1, 3]

// change the selection to a cursor behind the fourth letter inside the first input:
setSelection([document.querySelector("input"), 3, 3]);
selection(); // [HTMLInputElement, 3, 3]

// remove the selection again:
setSelection([null, NaN, NaN]);
```

Gets and sets the selection. Handles input, textarea, contentEditable elements and plain text. Use it to manipulate or keep the cursor / selection when overwriting values or innerHTML. In order to use it with an input mask to apply it to a contentEditable element, you can use:

```ts
import { createSelection } from "@solid-primitives/selection";
import { anyMaskToFn } from "@solid-primitives/input-mask";

const [selection, setSelection] = createSelection();

const ibanMask = anyMaskToFn("aa99999999999999999999");

const inputMaskHandler = ev => {
  const [node, start, end] = selection();
  if (ev.currentTarget === node) {
    const [value, selection] = ibanMask(node.innerHTML, [start, end]);
    node.innerHTML = value;
    setSelection([node, selection[0], selection[1]]);
  }
};

return <div contenteditable onInput={inputMaskHandler}></div>;
```

For more information about input-mask, see its [README.md](input-mask.md).

#### By-product: getTextNodes

Since we need it for the selection inside contentEditable elements, there is a function called `getTextNodes` that will return all text nodes inside the given DOM node in their actual order, even if encapsulated by other elements:

```ts
import { getTextNodes } from "@solid-primitives/select";

getTextNodes(div); // [Text, Text, Text]
```

At some point, this might move into the [utils](utils.md) package if used by other primitives, but in this case, it will be re-exported not to break compatibility.

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/selection/CHANGELOG.md)
