---
name: solid2
description: 'Use when implementing, debugging, reviewing, or migrating SolidJS 2 applications and integrations. Includes the complete bundled guides and API documentation for core reactivity, web rendering, routing, server functions, metadata, and Vite.'
---

# Solid 2

All published Solid 2 documentation is bundled locally, including guides, API references, examples, and diagrams. Choose a topic below, then open the relevant page in the [documentation index](references/index.md). Each page appears once in the index; files use `references/<topic>/<page>.md` with no deeper directories.

## Use the documentation

- Read a guide for an implementation pattern and the API reference for signatures and constraints. Load only the pages needed for the task.
- Client-only apps (Vite SPAs, canvas/WebGPU scenes, workers) mostly need Concepts, Guides, and Core API, plus Web API for rendering and refs. Skip Building apps, Routing, server functions, SSR, and deployment pages unless the task involves them.
- Before writing or retaining manual reactive forwarding, synchronized derived state, or resource-lifetime machinery, check the relevant built-in APIs in the index. Evaluate replacements against caller requirements for reactive reads, callback identity, ownership, and cancellation.
- Check the consuming package's installed versions. The snapshot follows a moving prerelease; use installed types and matching runtime source to resolve discrepancies. Report mismatches without silently upgrading dependencies. [Compatibility notes](references/compatibility.md) record the differences found during the RC.4 audit.
- For project-specific component boundaries and composition preferences, use [solid-jsx-architecture](../solid-jsx-architecture/SKILL.md).

## Navigation

| Topic or task | Documentation |
| --- | --- |
| First app, templates, project setup | [Getting started](references/index.md#getting-started) |
| Reactivity, JSX, stores, async, boundaries, mutations, SSR | [Concepts](references/index.md#concepts) |
| Effects, custom primitives, state, forms, lists, fetching, protected routes, rendering modes, integrations | [Guides](references/index.md#guides) |
| Debugging, performance, TypeScript, testing, observability | [Guides](references/index.md#guides) |
| App structure, styling, head, server functions, sessions, environment, middleware, deployment | [Building apps](references/index.md#building-apps) |
| Solid Router, TanStack, route definitions, navigation, router data, SSR | [Routing guides](references/index.md#routing-guides) |
| Moving from Solid 1, SolidStart, Solid Router, Solid Meta, or React | [Migration](references/index.md#migration) |
| Signals, memos, effects, stores, actions, context, control flow, owners, interop, diagnostics, types | [Core API](references/index.md#core-api) |
| DOM rendering, hydration, streaming, head, JSX properties, server functions, requests/responses | [Web API](references/index.md#web-api) |
| Router factory, typed paths, navigation, queries, history, server integration | [Router API](references/index.md#router-api) |
| Head, Title, Meta, Link, Base, Script, Style, Stylesheet | [Metadata API](references/index.md#metadata-api) |
| Vite plugin options, start mode, server functions, modules, manifest | [Vite API](references/index.md#vite-api) |
| Filesystem route conventions, tree, Vite integration, API routes | [Filesystem routing API](references/index.md#filesystem-routing-api) |
| Terminology and reading order | [Glossary](references/overview/glossary.md), [Overview](references/overview/index.md) |

## Search and maintenance

From this skill directory:

```sh
rg -n 'createSignal|hydration|server functions' references/index.md
rg -n 'ownedWrite|seedLoadingValue' references/core references/web
python3 scripts/sync_docs.py --check
```

The index and pages preserve upstream content, with internal links rewritten locally. `references/manifest.json` records the source exports, capture time, coverage, and hashes. Diagrams live in `assets/`.

To refresh the documentation, run `python3 scripts/sync_docs.py`. To reuse saved official exports, pass `--index /path/to/llms.txt --corpus /path/to/llms-full.txt`. The script checks coverage, file integrity, and local links; `--check` is read-only and works offline. Keep version-specific corrections in `references/compatibility.md` and review them after refreshing.
