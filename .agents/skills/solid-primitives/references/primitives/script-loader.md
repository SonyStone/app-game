# @solid-primitives/script-loader

Source version: `3.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/script-loader/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Creates a primitive to load scripts dynamically, either for external services or jsonp requests

## Installation

```
npm install @solid-primitives/script-loader
# or
yarn add @solid-primitives/script-loader
# or
pnpm add @solid-primitives/script-loader
```

## How to use it

createScriptLoader expects a props object with a `src` property. All the other props will be spread to the script element.

The `src` prop is required and will be used to set the `src` or `textContent` attribute. It can be a string or an accessor.

```ts
import { createScriptLoader } from "@solid-primitives/script-loader";

// For example, to use recaptcha:
createScriptLoader({
  src: "https://www.google.com/recaptcha/enterprise.js?render=my_token",
  async onLoad() {
    await grecaptcha.enterprise.ready();
    const token = await grecaptcha.enterprise.execute("my_token", { action: "login" });
    // do your stuff...
  },
});

// or pinterest embeds:
createScriptLoader({
  src: '!function(a,b,c){var d,e,f;d="PIN_"+~~((new Date).getTime()/864e5),...',
  onLoad() {
    window?.PinUtils?.build();
  },
});
```

## Definition

```ts
function createScriptLoader(props: ScriptProps): HTMLScriptElement | undefined; // script element with be undefined only on the server

type ScriptProps = Omit<ComponentProps<"script">, "src" | "textContent"> & {
  /** URL or source of the script to load. */
  src: string | Accessor<string>;
};
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/script-loader/CHANGELOG.md)
