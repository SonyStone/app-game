---
name: solid-jsx-architecture
description: 'Use when implementing, refactoring, reviewing, or fixing SolidJS components and reactive factories: choosing component and create* boundaries, props vs context, refs and controlled state, element bindings, resets, and resource lifetimes in JSX, including non-DOM scenes and web workers.'
---

# SolidJS JSX architecture

Keep application composition visible in JSX. Give state, operations, and reusable behavior focused APIs. Choose boundaries from what the code does, not component names or file length.

For Solid 2 API semantics, reactive scheduling, ownership, and async boundaries, use [solid2](../solid2/SKILL.md). This skill describes the project's architectural preferences.

Read the linked examples only for the decisions being made. Reuse material already read; reopen only missing sections or changed files.

## Composition and factories

- Keep unique screen composition at the call site, including loops, toolbars, and connections between actions and rendered elements. Length and nesting alone do not justify extraction.

- Extract components for reuse, independent rendering/layout responsibilities, or self-contained interaction behavior. Keep components that do useful work; inline wrappers that mainly enumerate children or forward dependencies.

- Use `create*` to encapsulate a coherent stateful operation under the caller's owner. A small `createZoom` can own the scale, zoom commands, and derived percentage. It does not need multiple callers or a large implementation to justify that boundary. Use ordinary functions for calculations and transformations.

- Return named observations and commands, such as `{ zoom, percent, zoomIn, zoomOut }`. Keep mechanics such as zoom increments inside the factory; expose a setter only when callers need to choose arbitrary values.

- Destructure the returned object at the call site: `const { zoom, zoomIn } = createZoom()`. This is safe because accessors, commands, and projections are stable references. Call accessors where the value is read (`zoom()`), not during destructuring.

- Pass focused values and callbacks. At the JSX boundary, read an accessor: `zoom={zoom()}` gives the child a reactive value prop. Pass an accessor itself when the API explicitly needs a deferred read, such as `createConnection(() => props.roomId)`.

- A factory may provide reactive props for an element declared by the caller, for example `<button {...triggerProps}>`. Keep the element, icon, and placement in JSX.

- A render prop may hand the caller a scoped API or a ready-made element whose behavior belongs to the supplying component, as in `<LanguageMenu>{(trigger) => <>…{trigger}…</>}</LanguageMenu>`. Call render-prop children inside the supplying component's owner and context providers.

When choosing factory/component boundaries or render-prop placement, read [composition examples](references/composition.md).

## Context and coordination

- Before adding context to avoid forwarding props, inspect the intermediate components. Removing composition-only wrappers may leave direct, focused dependencies. Consumer count or tree depth alone does not establish a shared service.

- Use context to coordinate the parts of a reusable compound widget. A menu root owns open state, focus coordination, and item registration; its trigger, content, and items consume that context. Each menu instance has its own scope. The caller still chooses and arranges menu items through children.

- Providers can also scope a real shared resource, such as one GPU device or connection used by a subtree. Name context accessors `use*` (`useMenu()`). Keep unrelated application state out of a widget's context.

- Use a small ref API when a parent needs commands such as open, close, or focus while the component owns its state. Clear the ref on disposal. Invoke ref commands from a handler, `onClick={() => menuRef()?.open()}`: Solid reads event-handler expressions once at creation, so `onClick={menuRef()?.open}` binds `undefined` before the ref is set. When the parent must determine the current state, expose controlled props and use a compatible `@solid-primitives/controlled-signal` API to support controlled and uncontrolled usage. Both modes can share the same internal context.

- Use event channels when independent senders and receivers or multiple subscribers need them. Queue commands before readiness only when delivery is required.

When choosing context, ref commands, or controlled state, read [coordination examples](references/coordination.md).

## Participation and lifetime

- Use JSX when placement expresses participation, a rendered element, or a dependency scope. Cleanup, async initialization, or the absence of DOM output alone does not require a component. A connection factory can own transport setup and cleanup while the caller renders readiness, errors, and data.

- Prefer a generic binding mechanism when the application only needs to attach behavior to a target. `createEventListener` from `@solid-primitives/event-listener` accepts an accessor target, moves listeners when it changes, and detaches for `undefined`, so conditional participation need not add `<Show>`. Keep a short wheel-to-zoom handler in the assembly; an extra zoom-specific component is not required.

- Separate persistent intent from a replaceable target. If enabled state must survive element replacement, store that choice and derive `enabled() ? element() : undefined`. If selecting a target fully represents the choice, target presence can be the state. Avoid storing both intent and a manually synchronized derived target.

- Track target replacement and removal through an owned binding or ref utility, such as `<Ref>` from `@solid-primitives/refs` feeding a signal. Native DOM ref callbacks in Solid 2 run without an owner, so effects or `onCleanup` created inside them never dispose; register cleanup in owned setup instead. Disabled behavior should release the listener rather than keep receiving events and immediately return.

- Factories and components own their resources under Solid's owner. Specify which inputs update resources and which require remounting. Close old resources before replacements, cancel pending work, and release late results. Keep JSX mounting explicit; factories and event handlers must not secretly mount component trees.

- Reserve `createRoot` for runtime entry points or explicitly independent lifetimes. Workers need their own compatible JSX runtime and owner, with a disposer invoked on cooperative shutdown. Forced termination does not run cleanup. Bridge messages to local reactive state.

When binding behavior to replaceable elements or separating target presence from persistent intent, read [participation examples](references/participation.md).

## Reactive state and public contracts

- Use signals for scalar state and stores for structured mutable data when property-level tracking is useful. Derive observations instead of synchronizing copies. Tie resets to the dependency that invalidates the state.

- In Solid 2, prefer function-form `createSignal` or `createStore` for editable state that resets from a reactive source. Keep this dependency in the state declaration instead of relaying resets through an effect. Select the reset key deliberately: if only an entity ID should reset edits, derive that ID with `createMemo` so replacing the entity object with the same ID preserves them.

- When a factory returns collections from a store whose arrays get replaced, wrap each in `createProjection(() => snapshot.messages, [])`. Returning `snapshot.messages` directly hands out the current array, which goes stale after the next replacement. Projections are stores, not accessors: pass `messages={messages}` without a call. A whole store or accessor API remains appropriate when that is the intended contract.

- Use branded types for domain identities and meaningful scalar distinctions, such as `RoomId`, `ZoomLevel`, and `Percent`, following the project's branding conventions. Derive types from existing APIs where practical.

- Use typed results or callbacks for expected errors; adapt throwing APIs at their boundary.

When changing reset dependencies or exposing replaceable store collections, read [reactive state examples](references/reactive-state.md).

## Implementation checks

- Match the installed Solid version, including effect cleanup, store setters, and projections. Use [solid-primitives](../solid-primitives/SKILL.md) before writing custom reactive infrastructure, as required by the project's `AGENTS.md`.

- For render scenes, expose drawing elements through JSX and separate preparation from drawing. Check `jsx-tokenizer`, `context`, and `refs` before writing custom infrastructure.

- Verify changed reactive behavior: updates, target replacement/removal, cancellation, late completion, and disposal. For collections, check replacement through the returned API. For scenes, check dynamic insertion/removal and draw order.
