# Proposal: reversible props on an existing element

Proposed as an experimental Solid Primitives addition targeting Solid 2. This is
a local draft; it has not been submitted to maintainers.

## Problem

Independent behaviors can need to add props to the same element they do not own.
For example, independently mounted pan and pick modes temporarily change the page
body's cursor. A review workflow can overlay a read-only property on an editor
created by an imperative library, follow replacement nodes, and release its changes
without resetting the library's latest state. A preview inspector can attach props
to a same-origin iframe's current selection after each document load.

Each behavior should release its own changes when its owner is disposed, even if
the owners are removed in a different order. If the component can collect all of
these props in its own JSX, ordinary spread/combineProps is the simpler solution.
Accessibility props by themselves are not the motivation.

Combining prop bags before rendering does not solve this case. The target already
exists, its renderer continues updating it, and each behavior has a separate
lifetime. A single Solid `assign`/`spread` has no reversible cleanup contract.

## Proposed interface

```ts
createPropsProxy(target, {
  get class() {
    return { dragging: dragging() };
  },
  get style() {
    return { transform: `translateX(${delta()}px)` };
  },
  onPointerUp: finishDrag
});
```

`target` accepts an element or an accessor that can temporarily return null or
undefined. Prop getters remain tracked while the target is absent. Replacing the
target releases the previous element; owner cleanup releases the current one.

`PropsProxy` provides the JSX form. `createSpread` provides an explicit prop updater
with reactive target selection, which is why its name retains `create`.
The package also exports `Props` for typing reusable prop bags.

## Composition contract

Attributes and patchable DOM properties use ordered layers with the last layer
winning. Classes add tokens and can mask lower tokens. Styles replay declaration
layers through CSSOM, preserving update order, shorthand behavior and priorities.
Delegated events invoke the base handler and active proxy handlers. Native event
subscriptions remain independent. Updating a layer does not move it to the top.

The supported renderer write paths update a base below the layers. Final cleanup
restores that latest base, not merely a snapshot taken at mount. Interception is
local to the target and lasts only while its layers are active. No global DOM
prototype is patched.

## Fit with the contribution guide

The existing `props` package combines input objects; this proposal manages props
on an existing element across independent owner lifetimes. The `styles` package
does not provide reversible declaration layers. Listener ownership and accessor
handling reuse `event-listener` and `utils` from Solid Primitives.

The purpose is narrow enough to discuss as one package, but the cost is greater
than a wrapper around one browser API. It maintains native descriptors, delegated
handler slots and Solid's assignment rules. Maintainers should decide whether that
maintenance burden belongs in the collection before packaging a release.

Reference: [Solid Primitives contribution guide](https://github.com/solidjs-community/solid-primitives/blob/main/CONTRIBUTING.md).

## Evidence and costs

- The workspace pins Solid and `@solidjs/web` to `2.0.0-rc.4`. Assignment parity tests
  compare supported ordinary cases against the installed `@solidjs/web.assign`.
- Tests cover independent owners, updates, target replacement, disposal order,
  string/object styles, nullish declaration masks, priorities, SVG, renderer writes,
  native method restoration, events, types and inert server exports.
- Chromium checks compile an actual SSR/hydration fixture, assert node identity,
  updates and early disposal, and fail on hydration warnings or browser errors.
- `pnpm --filter @app-game/solid-props-proxy measure` reports the full exported API
  with primitive dependencies bundled and the two Solid runtime packages external.
  The current measurement is 14,828 minified bytes and 4,780 gzip bytes.
  Keep that boundary when comparing its size with other packages.
- A style update replays all declarations in the element's active style layers.
  Work grows with the combined declaration count; each styled target also owns
  three detached CSSOM scratch objects. No runtime throughput claim is made.

## Open decisions for maintainers

- Whether to accept the target-local interception and dependency on Solid's
  delegated handler slots and internal hydration flag. Upstream runtime changes need matching tests and review.
- Whether the upstream package should keep plain-object targets. They remain in
  this workspace for existing consumers but provide weaker conditional restoration.
- Whether to expose the imperative updater under `createSpread` or a more specific
  name to avoid confusion with Solid's own spread helper.
- Whether supported external mutation paths are sufficient. Direct named CSS
  setters and classList methods beyond add/remove are not isolated. See the README.
- Browser coverage beyond Chromium and streamed/asynchronous hydration boundaries.

Seven runnable demos are linked from the README, covering style layers, body modes,
an external editor, target handoff, iframe reloads, workspace state and a custom
element. They share live DOM readouts and expandable code excerpts, with browser
tests for controls, cleanup and node replacement. The playground also runs alone
with the package's dev command.

The next external step is a stage-0 discussion with this contract and those demos.
Acceptance, package naming and a publication stage remain maintainer decisions.
