# @solid-primitives/permission

Source version: `2.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/permission/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Reactive wrapper around the browser [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API). Queries a named permission and returns a live signal that updates automatically whenever the permission state changes.

## Installation

```bash
npm install @solid-primitives/permission
# or
yarn add @solid-primitives/permission
# or
pnpm add @solid-primitives/permission
```

## How to use it

### `createPermission`

Queries a browser permission by name (or descriptor object) and returns a reactive accessor reflecting its current state.

```ts
import { createPermission } from "@solid-primitives/permission";

const permission = createPermission("microphone");
// permission(): "unknown" | "granted" | "denied" | "prompt"
```

The signal starts as `"unknown"` — the Permissions API query is async and the initial value is not available synchronously. After the first microtask, the signal resolves to the current state and begins tracking changes.

The signal updates automatically when the permission changes — for example when the user grants or revokes access in browser settings, or after an API call prompts the user.

**Accepted values** follow the [PermissionName](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query#name) vocabulary. Pass either a plain string or a full `PermissionDescriptor` object:

```ts
// Plain name
const mic = createPermission("microphone");

// Descriptor object (required for some permissions)
const cam = createPermission({ name: "camera" });

// Used by @solid-primitives/notification
const notifs = createPermission("notifications");
```

**Return values** map to [PermissionState](https://developer.mozilla.org/en-US/docs/Web/API/PermissionStatus/state):

| Value       | Meaning                                       |
| ----------- | --------------------------------------------- |
| `"unknown"` | Initial state — query has not resolved yet    |
| `"granted"` | Permission has been granted                   |
| `"denied"`  | Permission has been denied                    |
| `"prompt"`  | Not yet asked; prompting the user is possible |

### SSR

On the server, `createPermission` returns a static `() => "unknown"` accessor. No query is made and no listeners are registered.

### Reactive usage example

```tsx
import { createPermission } from "@solid-primitives/permission";

const CameraGate: Component = () => {
  const permission = createPermission("camera");

  return (
    <Switch>
      <Match when={permission() === "unknown"}>
        <p>Checking camera permission…</p>
      </Match>
      <Match when={permission() === "granted"}>
        <CameraFeed />
      </Match>
      <Match when={permission() === "denied"}>
        <p>Camera access denied. Enable it in browser settings.</p>
      </Match>
      <Match when={permission() === "prompt"}>
        <button onClick={() => navigator.mediaDevices.getUserMedia({ video: true })}>
          Allow camera
        </button>
      </Match>
    </Switch>
  );
};
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/permission/CHANGELOG.md)
