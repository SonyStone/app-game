---
name: solid-primitives
description: "Use when implementing features, fixing bugs, or refactoring SolidJS code. Choose Solid Primitives from the searchable catalogue and bundled package documentation, then compose suitable APIs into the solution."
---

# Solid Primitives

Use the [catalogue](references/catalogue.md) and bundled documentation. Resolve links relative to this skill; do not search for a checkout.

1. Search [references/catalogue.md](references/catalogue.md) by the required behavior or API name, including uninstalled packages. Read the matching rows or category, then follow package links. The catalogue includes utility groups and their import paths. Broaden the search when names do not match the behavior; do not load the whole catalogue by default.
2. Read their linked documentation: API variants, examples, reactive inputs, timing, cleanup, and SSR behavior relevant to the task. If the catalogue does not identify a candidate, search `references/primitives/*.md` by behavior. Reuse documentation already read; reopen only missing sections or changed files.
3. Verify exports and compatibility with the project's versions. Add compatible dependencies using its package manager without upgrading Solid. Consult release documentation when the snapshot leaves a contract unclear.
4. Reuse or compose suitable APIs for the behavior that remains necessary. When no single primitive replaces a helper, check whether several primitives can cover its separate responsibilities. Before writing or retaining custom machinery, identify the required behavior that the closest candidates or their composition cannot provide.

## Authoring

When writing utilities or changing reactive APIs:

- Give each utility one purpose; compose existing primitives and keep application policy in callers. Use `makeX` for imperative setup/control and `createX` for reactive inputs/output.
- Choose values, accessors, and callbacks explicitly. Read accessors inside tracking computations; return accessors/getters and named commands. Derive state instead of synchronizing duplicate signals.
- Preserve per-key tracking. Check [map](references/primitives/map.md), [set](references/primitives/set.md), [trigger](references/primitives/trigger.md), and [utils](references/primitives/utils.md) before rebuilding it.
- Define ownership and cancellation. Register cleanup; provide disposers for ownerless use. Cancellation followed by disposal must be safe. Detach old targets before attaching replacements; handle absent targets.
- Create schedulers once per lifetime. Retain cancellation; cancellation does not imply flushing. `createRAF` runs until stopped.
- Follow the installed Solid version's effect/cleanup semantics. Callbacks and async continuations do not automatically retain owners. Guard browser globals during module evaluation and setup; define SSR fallback values.
- Document inputs, defaults, timing, and cleanup. Verify updates, target replacement, cancellation/disposal, and scheduler edges; hydration when output depends on browser state.

See [event-listener](references/primitives/event-listener.md) for imperative and reactive API examples.

To refresh this skill's documentation: `python3 scripts/sync_docs.py --source <checkout-path>`. Maintain descriptions in [purposes.json](references/purposes.json) and utility groups in [utilities.json](references/utilities.json); synchronization preserves both.
