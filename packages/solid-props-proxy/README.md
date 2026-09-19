# solid-props-proxy

Temporary prop layers for existing elements and objects, owned by a Solid scope.
The element can be created elsewhere. Disposing the proxy or changing its target
removes its props from the old target.

This package targets the workspace's `solid-js` and `@solidjs/web` **2.0.0-rc.4**.
Solid itself was not upgraded as part of this migration.

```tsx
const [target, setTarget] = createSignal<HTMLButtonElement | null>(null);

return (
  <>
    <button ref={setTarget}>Drag me</button>
    <PropsProxy
      target={target()}
      class={{ dragging: dragging() }}
      style={{ transform: `translateX(${delta()}px)` }}
      onPointerUp={finishDrag}
    />
  </>
);
```

For behavior outside JSX, create the proxy in an owned setup scope. Prop getters
are tracked, including when the target is initially absent.

```ts
createPropsProxy(target, {
  get class() {
    return { dragging: dragging() };
  },
  get style() {
    return { transform: `translateX(${delta()}px)` };
  }
});
```

`createSpread(target)` is the lower-level imperative updater. Each call snapshots
its props and applies them synchronously. During a hydration claim, the latest
update waits for a microtask after that pass. Use it in a tracked effect or an effect's
apply callback, never in a memo or an effect's compute callback. Target replacement
is handled after rendering. Calls after owner disposal are ignored.

## Relationship to Solid's client.ts

The source of truth is
[`packages/web/src/client.ts` at 2.0.0-rc.4](https://github.com/solidjs/solid/blob/solid-js%402.0.0-rc.4/packages/web/src/client.ts),
matching the installed runtime. A newer local Solid checkout does not change this
package's dependency version.

- `src/solid-dom.ts` contains `assignDOMProp`, the reversible counterpart of
  Solid's private `assignProp`. Its dispatch order and form-control exceptions
  follow that function. Solid does not export `assignProp`.
- `src/spread.ts` collects props and diffs them like Solid's `spread`/`assign`,
  while owning target replacement, layer updates and cleanup. Enumerable inherited
  props are included, as in `client.ts`.
- Attribute and XML attribute layers call the actual `@solidjs/web.setAttribute`
  and `setAttributeNS` functions to write their resolved values. That also keeps
  Solid's attribute guards and element-claim hooks in the write path.
- Style layers replay declarations on detached CSSOM objects. Object declarations
  call `@solidjs/web.setStyleProperty`; the resolved style attribute uses Solid's
  attribute writer. A shared stack owns priorities, shorthand overlap and cleanup.
- Refs and event delegation use Solid's `ref`, `delegateEvents` and delegated
  container functions. Event composition and listener cleanup belong to the proxy.

Calling Solid's whole `assign` or `spread` function directly would lose the layer
contract: those functions do not return reversible patches, preserve a base value,
or compose independent proxy owners. Sharing Solid's whole-style bookkeeping
would also mix the element renderer's state with the proxy's state. These parts
therefore remain adapters with separate state.

`src/client-parity.test.tsx` compares matching cases directly against the installed
`@solidjs/web.assign`. The layer-specific differences below are intentional and
are covered separately.

## Solid 2 migration

The assignment rules follow the installed `@solidjs/web` runtime. Reference:
[Solid 2 DOM changes](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/07-dom.md).

| Solid 1 spelling or behavior             | Supported form                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `on:click`, `oncapture:click`            | `onClick`; native options through owned listener utilities or ref directives |
| `attr:disabled`, `bool:disabled`         | `disabled={true}` or `disabled={false}`                                      |
| `className`, `classList`                 | `class`, accepting strings, arrays and records                               |
| Automatic custom-element property writes | Attributes by default; `prop:model` for a property                           |
| Single ref callback                      | `ref` also accepts nested callback arrays                                    |

Boolean attribute values mean presence or absence. Pass strings when an attribute
needs the literal text `"true"` or `"false"`. Stateful DOM properties such as input
`value` remain properties; nullable input/textarea values normalize to an empty
string. XML namespaces use `setAttributeNS` for HTML and SVG targets.

Refs use Solid's own dispatcher: callbacks run without a reactive owner. Create
reactive subscriptions in owned setup code, not inside the ref callback. A return
value from a ref callback is not a disposer managed by this package.

`createPropsProxy` uses Solid 2's compute/apply effect phases. Prop reads happen in
compute; DOM changes happen in apply. Server exports are inert and do not read
DOM-dependent target or prop getters. The proxy does not contribute SSR markup.

## How layers compose

- Attributes and patchable DOM properties keep a shared ordered stack. The last
  active layer wins. Updates retain the layer's position; cleanup reveals the
  latest intercepted base value. A null/false attribute layer can hide a base attribute.
- Classes retain the package's overlay semantics: string tokens add classes and
  false record entries mask classes from earlier layers. Boolean class values are
  ignored. This is a layer-composition rule, not ordinary JSX replacement. Writes
  through `setAttribute`, HTML `className`, and `classList.add/remove` update the
  underlying class value, including writes from Solid 2's class renderer.
- Delegated events call the base handler followed by active proxy handlers in
  application order. Updating or removing a lower layer preserves the others.
  Solid render roots handle delegation; targets initially outside a root acquire
  a local delegated container that is released with the last handler layer.
- Native events are independent subscriptions. Adding a proxy listener does not
  queue other `addEventListener` calls. The legacy listener-lock API has been removed.
- Plain objects use conditional restoration rather than DOM descriptor locking.
- `children` is always ignored. The proxy does not own element creation or content.

## Style layers

Each element has one ordered style stack. The base is the inline style underneath
all proxies; each proxy contributes declarations. Updating a layer preserves its
position, including when switching between a string and an object.

For example, the base transform is `translateX(0px)`, A applies `translateX(10px)`,
and B applies `translateX(20px)`. Updating A keeps B visible. Disposing A before B
leaves B visible; disposing B afterwards restores `translateX(0px)`.

- Strings and records overlay their declarations, preserving unrelated base styles.
  An empty string, empty object, or nullish whole style contributes no declarations.
- A missing record key exposes the lower declaration. An explicitly `undefined`
  record value removes that declaration while the layer is active. JavaScript
  `null` values have the same runtime behavior.
- The browser parses strings and resolves shorthand/longhand overlap. Replaying
  the layers avoids restoring a removed shorthand from another owner's snapshot.
- Layer order determines the winning declaration. A higher normal declaration can
  replace a lower `!important` declaration, as with consecutive CSSOM `setProperty`
  calls. String styles can supply `!important`; cleanup preserves the base priority.
  Object values follow Solid's `setStyleProperty` and do not parse embedded priorities.
- `setAttribute('style', ...)`, `removeAttribute('style')`, `style.cssText`,
  `style.setProperty` and `style.removeProperty` update the underlying base while
  overlays stay visible. These include the write paths used by Solid 2's renderer.
  `removeProperty` returns the removed base value, even when an overlay is visible.
- The last cleanup restores the base attribute and original CSSOM method descriptors.
  The `element.style` object retains its identity.

Direct named assignments such as `element.style.color = 'blue'`, `style.cssFloat`,
and native prototype calls are not intercepted. They can bypass a visible layer
and be overwritten by its next update or cleanup. Use the supported write paths
for external updates while a style layer is active.

Class interception covers the paths used by this Solid version. Other mutation
paths, such as `classList.toggle/replace`, `classList.value`, and direct native
prototype calls, are not intercepted. This package is not a general DOM mutation
isolation mechanism.

## Verification

```sh
pnpm --filter @app-game/solid-props-proxy test
pnpm --filter @app-game/solid-props-proxy typecheck
pnpm --filter @app-game/solid-props-proxy test:browser
pnpm --filter @app-game/solid-props-proxy measure
```

DOM tests use jsdom for CSSOM behavior and Happy DOM for the remaining Solid 2
cases. The server suite resolves the actual Node/server exports. Type checks cover
the browser fixtures and existing proxy and docking examples.

`test:browser` compiles the same fixture for SSR and hydration with the workspace's
Solid plugin, then runs Chromium. It checks server-node reuse, initial and reactive
styles, delegated events, early disposal and descriptor restoration, and fails on
browser errors or hydration warnings. Install its browser once if needed with
`pnpm exec playwright install chromium`. Streaming hydration and other browser
engines remain unverified.

`measure` bundles the full public API with its primitive dependencies, minifies it
with esbuild, and reports raw and gzip bytes. `solid-js` and `@solidjs/web` stay
external, since the consuming app already supplies them.

## Public API and contribution scope

The package exports `PropsProxy`, `createPropsProxy`, `createSpread`, and the `Props`
type from its root. Internal patch controllers and utilities have no package
subpath exports. Replace old `@app-game/solid-props-proxy/types` imports with
`@app-game/solid-props-proxy`. Plain-object targets remain supported for existing
consumers, with conditional restoration rather than the DOM layer guarantees.

This is an experimental candidate, not a published Solid Primitives package.
See [the contribution proposal](./PROPOSAL.md) for scope, costs and open questions.

## When to use it

Prefer an ordinary spread or `combineProps` when the component owns the JSX and
can collect the behavior's props there. The useful distinction is separate
ownership and lifetime, not whether the element was created once. Accessibility
attributes alone are not a reason to introduce DOM interception.

| Target or scenario                                  | Useful application                                                                      | Boundary                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `document.body`                                     | Temporary pan/pick/drag cursors and selection styles owned by independent modes         | Use lazy accessors for SSR. A cursor/overflow overlay is not a complete modal or scroll-lock implementation.                   |
| Editor, map, grid or canvas host owned by a library | Review/read-only state, temporary highlighting, a tool's cursor or input handlers       | Use the library's API for its internal state. Keep the target accessor current if it replaces nodes.                           |
| Existing workspace region                           | A temporary `prop:inert` layer while an independently mounted workflow owns interaction | Focus restoration and the surrounding dialog behavior belong to that workflow.                                                 |
| Same-origin iframe document                         | Selection/inspection of a preview node across frame reloads                             | Reacquire the target after `load`, and release it on navigation. Cross-origin inner DOM is inaccessible.                       |
| Custom element host                                 | Public reversible properties through `prop:*`, CSS custom properties, supported events  | Do not assume a property setter has reversible side effects or that a closed shadow root is accessible.                        |
| `window` / `document`                               | Global keyboard, pointer, blur or visibility subscriptions                              | Use `createEventListener`. These are currently plain-object targets in this package, not JSX event targets with a layer stack. |

The showcase has seven interactive cards with live DOM readouts, controls, and
expandable API excerpts. Earlier experiments remain in a separate disclosure and
mount only when opened.

Run the same page independently of the application's other routes:

```sh
pnpm --filter @app-game/solid-props-proxy dev
```

The standalone preview listens on `http://127.0.0.1:3121`. The existing application
route remains `/ui-components-examples/solid-props-proxy`.

Examples:

- [Style layers](../ui-components-examples/solid-props-proxy/style-layers.tsx)
  demonstrates updates to a lower layer and disposal in either order.
- [Target handoff](../ui-components-examples/solid-props-proxy/target-handoff.tsx)
  follows selection between two persistent nodes and releases the old handler.
- [Workspace state](../ui-components-examples/solid-props-proxy/workspace-state.tsx)
  gives two independent operations an `inert` layer on the same region.
- [Custom element](../ui-components-examples/solid-props-proxy/custom-element.tsx)
  uses a public reversible setter and a CSS variable on a component with a closed
  shadow root. The component itself renders its mode.
- [Body modes](../ui-components-examples/solid-props-proxy/body-modes.tsx) overlays
  pan and pick cursors on the same body. Pick combines the proxy with owned
  `window.blur` and `document.keydown` subscriptions using `createEventListener`.
- [External editor](../ui-components-examples/solid-props-proxy/external-widget.tsx)
  uses a small imperative demo adapter that creates and replaces a textarea. A
  separately mounted read-only layer follows its element and restores the widget's
  latest base state. It does not claim compatibility with a particular editor SDK.
- [Iframe preview](../ui-components-examples/solid-props-proxy/iframe-preview.tsx)
  adds inspection props and a click handler to a button created by `srcdoc`, then
  follows a fresh target after reload.

For an already initialized custom element that exposes a reversible `readOnly`
property, the same pattern can use its public API:

```ts
createPropsProxy(editorElement, {
  'prop:readOnly': true,
  style: { '--accent': 'orange' }
});
```

No element registration or shadow-tree mutation is needed here. The browser suite
checks a real custom element setter, foreign-realm input properties, and all seven
showcase examples, including removal and replacement. DOM recognition uses the
target document's constructors rather than assuming the parent window's realm.

The iframe's outer element remains a normal proxy target regardless of its `src`.
Access to its inner document follows the browser's
[same-origin rule for contentDocument](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/contentDocument).
