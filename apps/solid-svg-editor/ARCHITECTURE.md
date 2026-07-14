# Solid SVG Editor Architecture Roadmap

Audited on 2026-07-02 against the active app in `apps/solid-svg-editor`.

## Verdict

This is not a bad prototype. The code already has strict TypeScript, immutable SVG node updates,
app-local tests, and early registry-shaped seams for tools, panels, shortcuts, capabilities, and
rendering. The current gap is that those seams are not yet stable editor contracts. Most new editor
features still require hand-threading through the shell controller, viewport interactions, inspector,
SVG metadata tables, handles, shortcuts, and history.

To build toward an Illustrator-class editor, the foundation should revolve around a small editor
kernel plus contribution registries. UI features should register commands, tools, panels, renderers,
capabilities, and services instead of expanding one central controller.

## Current Strengths

- `tsconfig.app.json` enables strict checks, including `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `noImplicitOverride`.
- `svg-model.ts` uses immutable tree updates and branded `SvgNodeId` values.
- `editor/svg-document.ts` has a `SvgDocument` wrapper and resource index, which is the right
  direction for symbols, paint servers, masks, filters, markers, and reference validation.
- `editor/commands.ts` already defines `EditorCommand`, command IDs, history policies, and command
  events.
- `features/viewport/tools/toolRegistry.ts` already proves the tool chain can be priority ordered
  and event-driven.
- `features/panels/panelRegistry.tsx` and `features/shortcuts/shortcutRegistry.ts` show that UI
  surfaces can be registry-backed.
- App-local tests now cover core model, document, geometry, path data, capabilities, shortcuts, and
  the tool registry.

## Main Risks

1. Shell orchestration is too large.
   `src/features/shell/createEditorAppController.ts` composes nearly every subsystem and returns
   UI-shaped prop bags. It should become a thin composition root around an editor kernel.

2. Commands are closures, not durable operations.
   `EditorCommand.apply(root)` is convenient, but opaque closures cannot be serialized, replayed,
   inspected, synced, diffed, or exposed to plugins. `invert` and `merge` exist in the type but are
   not yet the basis of history.

3. History stores whole root snapshots.
   `createEditorDocuments.ts` pushes cloned roots into mutable `past` and `future` arrays. This is
   simple and correct for now, but expensive for large SVGs and weak for collaboration, command
   replay, and precise undo grouping.

4. Viewport interactions are monolithic.
   `createViewportInteractions.ts` contains pan, zoom, rotate, touch gestures, marquee selection,
   move selection, handle drags, transform-box drags, DOM measurement, command transactions, and
   tool registry construction. Adding a pen tool, node-edit tool, text tool, eyedropper, shape tool,
   or lasso would keep expanding this file.

5. SVG capabilities are hard-coded across multiple layers.
   `svg-db.ts` owns element and attribute metadata, `editor/handles.ts` switches by element name,
   and `InspectorInputs.tsx` chooses controls by attribute type. Pro-level SVG support needs a
   contribution model where each capability can bring schema, defaults, handles, inspector controls,
   validators, converters, and commands.

6. Rendering and measuring are too direct.
   `svg-renderer.tsx` renders model nodes as Solid `Dynamic` nodes with raw attrs, while selection
   geometry reads global DOM via `document.querySelectorAll('[data-node-id]')`. That is fine for a
   first renderer, but future hit testing, alternate renderers, offscreen measurement, spatial
   indexing, unsupported SVG policies, and canvas/WebGPU previews need adapter boundaries.

7. Selection is node-ID based only.
   `createEditorSelection.ts` handles tree node selection and a path-command index. Future editing
   needs typed selection targets: nodes, path segments, anchors, handles, text ranges, gradient stops,
   artboards, guides, masks, symbols, and isolation scopes.

## Target Foundation

### Editor Kernel

Create a stable runtime object that UI and plugins receive. It should hide Solid component prop
plumbing and expose durable editor services.

```ts
export interface EditorKernel {
  readonly documents: DocumentService;
  readonly selection: SelectionService;
  readonly commands: CommandService;
  readonly viewport: ViewportService;
  readonly settings: SettingsService;
  readonly resources: ResourceService;
  readonly registries: EditorRegistries;
}
```

The shell controller should instantiate this kernel, then hand it to `TopBar`, `EditorSidebar`,
`EditorViewport`, and modals through small UI contexts. New capabilities should depend on the
kernel, not on a giant controller return type.

### Command And Operation Model

Split user intent from document mutation:

- `Command`: named, user-facing action with label, shortcut metadata, enablement, and transaction
  behavior.
- `Operation`: serializable document change such as `setAttribute`, `insertNode`, `removeNode`,
  `moveNode`, `replacePathCommand`, `transformNodes`.
- `Transaction`: one or more operations with merge/cancel support for drags.

Keep closure-based commands temporarily as an adapter, but make new commands emit operations.

```ts
export type EditorOperation =
  | { readonly kind: 'svg.set-attribute'; readonly nodeId: SvgNodeId; readonly name: string; readonly value: string }
  | { readonly kind: 'svg.remove-attribute'; readonly nodeId: SvgNodeId; readonly name: string }
  | { readonly kind: 'svg.insert-node'; readonly parentId: SvgNodeId; readonly node: SvgNode; readonly index?: number }
  | { readonly kind: 'svg.remove-node'; readonly nodeId: SvgNodeId }
  | { readonly kind: 'svg.move-nodes'; readonly nodeIds: readonly SvgNodeId[]; readonly targetId: SvgNodeId; readonly position: DropPosition };
```

This unlocks deterministic undo, command replay, plugin safety, collaboration, macro recording, and
better tests.

### Contribution Registries

Keep the existing registry direction, but make it universal:

```ts
export interface EditorContribution {
  readonly id: string;
  readonly commands?: readonly CommandContribution[];
  readonly tools?: readonly ToolContribution[];
  readonly panels?: readonly PanelContribution[];
  readonly shortcuts?: readonly ShortcutContribution[];
  readonly svg?: readonly SvgCapabilityContribution[];
  readonly renderers?: readonly RendererContribution[];
}
```

Core editor behavior should itself be installed as contributions. That makes first-party features
and future plugin features follow the same path.

### SVG Capability Registry

Replace scattered SVG metadata with element/attribute contributions:

```ts
export interface SvgElementContribution {
  readonly name: string;
  readonly defaults: Readonly<Record<string, string>>;
  readonly allowedChildren?: readonly string[];
  readonly attributes: readonly SvgAttributeContribution[];
  readonly createHandles?: (context: HandleContext) => readonly HandleDescriptor[];
  readonly renderInspector?: (context: InspectorControlContext) => JSX.Element;
  readonly validate?: (node: SvgElementNode, document: SvgDocument) => readonly SvgDiagnostic[];
}
```

This is the path to supporting text, gradients, filters, masks, symbols, markers, patterns,
resources, custom attribute editors, and SVG conformance diagnostics without turning the inspector
into a giant switch statement.

### Tool Registry

Split `createViewportInteractions.ts` into tools that own their lifecycle:

- `viewNavigationTool`: wheel zoom, middle-button pan, alt-rotate, touch gestures.
- `selectionTool`: click selection, marquee, lasso later.
- `moveTool`: move selected objects and snapping.
- `transformTool`: transform box, resize, rotate, modifier constraints.
- `handleTool`: element handles and path anchors.
- Future tools: pen, pencil, shape, text, eyedropper, gradient, node edit, artboard.

Tools should emit commands/operations and overlays. They should not directly know the app shell.

### Renderer And Measurement Adapters

Introduce a renderer contract with separate responsibilities:

- document rendering
- overlay rendering
- measuring selected objects
- hit testing
- DOM/SVG event target resolution
- raster preview generation

The current Solid SVG renderer can be the default adapter. A later high-performance renderer can
share the same document, selection, and command systems.

### Typed Selection Targets

Move from `readonly string[]` to a discriminated union:

```ts
export type SelectionTarget =
  | { readonly kind: 'node'; readonly nodeId: SvgNodeId }
  | { readonly kind: 'path-command'; readonly nodeId: SvgNodeId; readonly index: number }
  | { readonly kind: 'path-anchor'; readonly nodeId: SvgNodeId; readonly commandIndex: number; readonly parameter: string }
  | { readonly kind: 'gradient-stop'; readonly nodeId: SvgNodeId; readonly stopId: SvgNodeId };
```

This avoids bolting each new edit mode onto `selectedIds` and `selectedPathCommand`.

## Implementation Progress

- 2026-07-02: Started Phase 1 by adding `src/editor/operations.ts`, operation-backed command
  factories under `src/editor/commands/`, and focused tests for operation reducers and command
  factories. Existing node actions now dispatch command factories for delete, duplicate, move,
  reorder, insert, attribute updates, text updates, and path-command insertion.
- 2026-07-02: Added `src/editor/kernel.ts` service/contribution contracts and made command
  transactions cancellable. Pointer cancel paths now rollback active document transactions instead
  of committing them, including restoration of redo history and dirty/code state.
- 2026-07-02: Introduced explicit `CommandTransaction` objects and `src/editor/history.ts`.
  History entries now record operation and inverse-operation metadata for operation-backed commands,
  while retaining root snapshots as the compatibility undo/redo fallback.
- 2026-07-02: Started Phase 3 by splitting the default viewport tool definitions into separate
  modules for touch, view navigation, selection, element handles, and transform boxes. The existing
  `ViewportToolRegistry` ordering and pointer-cancel routing are covered by focused tests.
- 2026-07-02: Extracted selection, marquee, and move-selection behavior from
  `createViewportInteractions.ts` into `selectionToolController.ts`, with controller-level tests for
  node pointer down, move threshold updates, commits, and click-threshold marquee clearing.
- 2026-07-02: Added `viewportMeasurement.ts` with a DOM-backed `ViewportMeasurementAdapter`.
  Marquee hit testing and selection-box measurement now go through that adapter instead of raw DOM
  queries inside tool/controller code, with focused tests for query-root hit testing, world-space
  selection bounds, and raster-preview measurement suppression.
- 2026-07-03: Added `ViewportToolbarContribution` and moved the viewport toolbar controls into
  `core.viewport-toolbar`, so first-party and extension toolbar groups now render through the same
  registry projection instead of `EditorViewport` receiving one prop per button.
- 2026-07-03: Added `ViewportOverlayContribution` with separate transformed-SVG and HTML overlay
  placements. Selection handles, transform-box controls, and marquee selection now render through
  `core.viewport-overlays`, giving future guides, rulers, tool previews, and plugin overlays the
  same projection path.
- 2026-07-03: Added `ViewportLayerContribution` with viewport-space and world-space SVG placements.
  The viewport background, grid, page checkerboard, reference image, vector document, and raster
  preview now render through `core.viewport-layers`, opening a renderer-stage path for guides,
  rulers, artboards, proofing layers, and plugin previews.
- 2026-07-03: Promoted viewport layer and overlay runtime state into kernel-backed viewport
  services. `EditorViewport` now consumes `ViewportLayerService` and `ViewportOverlayService`
  objects instead of rebuilding them from a wide shell prop list, so renderer-stage and overlay
  contributions have stable service objects to target.
- 2026-07-03: Collapsed viewport contribution handoff to a kernel-backed context. The app now
  passes one viewport context into `EditorViewport`, and the viewport host resolves toolbar, layer,
  and overlay contributions from `kernel.registries` while still allowing explicit service
  projections in focused tests.
- 2026-07-03: Promoted viewport host DOM refs, transform state, and canvas event handlers into a
  kernel-backed `ViewportHostService`. The app now hands `EditorViewport` only the viewport context,
  while focused tests can still inject explicit host, layer, and overlay services.
- 2026-07-02: Extracted element-handle and transform-box drag behavior into
  `elementHandleToolController.ts` and `transformBoxToolController.ts`. The viewport interaction
  layer now wires those controllers into the existing tool registry while focused tests cover
  transaction begin/update/commit behavior, queued handle updates, and transform command output.
- 2026-07-02: Extracted view navigation behavior into `viewNavigationToolController.ts`. Wheel zoom
  and rotation, pan RAF updates, canvas rotation drags, and two-touch gestures now live behind the
  tool controller boundary with focused coverage for gesture state, camera updates, and viewport
  preview keepalive behavior.
- 2026-07-02: Started Phase 4 by adding `coreSvgCapabilityContribution.ts` and adapting
  `svgCapabilities` to consume `SvgCapabilityContribution` data while preserving its existing API.
  Element metadata, attribute metadata, child validation, and handle providers can now come from SVG
  contributions, with tests covering both the core adapter and a custom contribution.
- 2026-07-02: Moved element creation and add-element menu discovery onto `svgCapabilities`.
  Capability contributions can now mark elements as addable, preserve add-menu ordering, and create
  default element nodes through the registry. Document add actions, inspector add menus, and
  context-menu group insertion now use the contribution-backed registry instead of hard-coded
  `svg-db` defaults/lists.
- 2026-07-02: Split structural SVG tree operations from SVG capability knowledge. `svg-model.ts`
  no longer imports `svg-db`; it keeps low-level node construction, raw attribute reads, and
  injectable child validation. Editor-level helpers now provide SVG attribute defaults, empty
  documents use `svgCapabilities.createElement('svg')`, and operation-backed move operations route
  child validation through the capability registry.
- 2026-07-02: Moved `tree-utils.ts` off direct SVG metadata table imports. Ordered inspector
  attributes, default attribute values, and numeric clamping now flow through `svgCapabilities`,
  with capability metadata extended to expose attribute number ranges and focused tests covering the
  adapter behavior.
- 2026-07-02: Moved resource element and reference metadata into SVG capability contributions.
  `svg-document.ts` now indexes reusable resources through `svgCapabilities`, preserving the
  unknown-ID fallback while allowing custom contributions to define resource kinds and reference
  attributes with focused tests.
- 2026-07-02: Added contribution-backed SVG diagnostics. Documents now carry diagnostics for
  unsupported elements, unknown attributes, invalid child relationships, duplicate IDs, and broken
  resource references, and SVG capability contributions can provide custom element validators.
- 2026-07-02: Moved inspector attribute control resolution behind SVG capability contributions.
  Attribute contributions can now provide custom control renderers, partial attribute contributions
  merge with core metadata instead of replacing it, and the built-in inspector controls are
  registered through an inspector-scoped SVG contribution.
- 2026-07-03: Split the first-party SVG capability payload into installable groups for structure,
  shapes, gradients, symbols, filters, masks, markers, patterns, and presentation attributes while
  preserving the combined `coreSvgCapabilityContribution` export for compatibility. Element
  capability overrides now dedupe by element name so `getElement`, creation, validation, and handle
  resolution agree on the same active contribution.
- 2026-07-03: Added `core.svg.text` as a first-party SVG capability group for `<text>` and
  `<tspan>`. SVG element contributions can now provide custom icons and capability-owned node
  factories, allowing text insertion to create a visible child text node without hard-coded
  inspector or command special cases.
- 2026-07-02: Started Phase 5 by introducing `rendererAdapter.ts`. The renderer boundary now
  defines node rendering props plus viewport services for selection-box measurement, marquee hit
  testing, event-target node lookup, viewport overlay conversion, and viewport client rects. The
  selection tool now consumes this adapter instead of direct DOM selectors or viewport element
  measurements.
- 2026-07-03: Opened the viewport renderer adapter to renderer contributions. `RendererContribution`
  can now provide a `createViewportRenderer(base)` factory, and the app shell composes installed
  viewport renderers over the default DOM/SVG adapter before wiring camera math, viewport tools, and
  the kernel rendering service.
- 2026-07-02: Shared the DOM/SVG renderer adapter from the shell composition root and routed
  viewport camera client-rect math through it. `createViewportCamera` no longer reads SVG DOM
  bounds directly; zoom anchoring, client-to-world projection, and viewport-center angle math now
  depend on the renderer adapter boundary with focused tests.
- 2026-07-02: Added `svg-resource-graph.ts` for document-level resource and inherited-style
  queries. `SvgDocument` now carries a resource graph that resolves forward and reverse resource
  references, target resource nodes, and inherited attributes through capability metadata. Core SVG
  attribute contributions now mark inherited presentation attributes, and custom contributions can
  do the same.
- 2026-07-02: Added `svg-spatial-index.ts` as the first document-side spatial query surface.
  `SvgDocument` now carries a transform-aware model-space spatial index for core SVG geometry,
  path data, and points-based shapes, with rectangle queries, point hit testing, and focused bounds
  coverage. `createEditorDocuments` also exposes `activeSpatialIndex` for future tool/query use.
- 2026-07-02: Started consuming `activeSpatialIndex` from viewport selection. Marquee selection
  keeps renderer hit testing as the visual baseline, then falls back to the model-space
  `SvgSpatialIndex` when the renderer has no IDs, converting client rect corners through viewport
  math. Focused tests cover spatial fallback and renderer precedence.
- 2026-07-02: Started typed selection targets with `selection-targets.ts`. `createEditorSelection`
  now exposes `selectedTargets`, `setSelectedTargets`, and `selectTarget` while preserving existing
  `selectedIds` and `selectedPathCommand` compatibility views, giving future tools a path toward
  node, path-command, anchor, stop, and text-range selections without a disruptive UI rewrite.
- 2026-07-02: Promoted typed selection targets to the internal selection state. Legacy
  `selectedIds` and `selectedPathCommand` are now projections/setter adapters over normalized
  `SelectionTarget[]`, so future tools can add richer target kinds without creating more parallel
  selection signals.
- 2026-07-02: Migrated document actions, inspector path-command selection, and viewport
  node/marquee selection writes onto typed target APIs. These paths now call `selectTarget` or
  `setSelectedTargets`, while legacy path-command and node-ID accessors remain read compatibility
  views for existing rendering and inspector highlighting.
- 2026-07-02: Extended typed selection targets with `path-anchor`. Path parameter inputs now select
  anchor targets for individual command parameters, while `selectedPathCommand` still projects the
  parent command for compatibility with existing row highlighting and keyboard command insertion.
- 2026-07-02: Connected `selectedPathAnchor` to viewport handles. Path handles now expose their
  corresponding selection targets, derived viewport state marks the matching handle active, and the
  handle layer renders active anchors with accent styling and a testable active marker.
- 2026-07-02: Added `contributions.ts` with `createEditorRegistries`, turning the kernel
  contribution interfaces into a runtime aggregation primitive. Installed contributions now flatten
  into command, tool, panel, shortcut, SVG, and renderer registries in a deterministic order.
- 2026-07-03: Made viewport path handles update typed selection on pointer down. Handle descriptors
  can carry `selectionTargets`, and the element-handle controller selects the first matching target
  before starting the drag transaction, so clicking an anchor handle now selects the same target
  model used by inspector path parameter inputs.
- 2026-07-03: Routed path-anchor dragging through operation-backed handle command factories. Path
  handles now create serializable path-anchor update commands, transformed handles preserve those
  factories through viewport-to-local coordinate conversion, and the element-handle controller
  prefers a handle-provided command before falling back to legacy closure wrapping.
- 2026-07-03: Extended operation-backed handle commands to core shape and points editing. Circle,
  ellipse, rect, line, polygon, and polyline handles now create durable set-attributes or
  update-point commands, giving viewport handle drags serializable operations across the default
  element handle set instead of only path anchors.
- 2026-07-03: Converted move-selection and transform-box drags to operation-backed transform
  commands. Global selection transforms now resolve to per-node local `transform` set-attribute
  operations, preserving existing parent-transform math while making object movement, resizing, and
  rotation replayable through command history metadata.
- 2026-07-03: Made durable handle editing explicit in the extension contract. Handle descriptors are
  now either command-backed (`commandMode: "command"`) or legacy-compatible, and viewport handle
  drags use that discriminator before falling back to closure wrapping. Custom SVG capability
  contributions can now expose command-backed handles with operation metadata.
- 2026-07-03: Routed structured inspector path and point edits through semantic command factories.
  Path-parameter inputs now dispatch path-anchor update commands and point-row inputs dispatch
  point update commands, so inspector edits share durable operation-backed command paths with
  viewport handle editing.
- 2026-07-03: Extended semantic inspector commands to path command structure actions. Inspector
  path add, insert, convert, delete, and relative/absolute toggle controls now dispatch
  operation-backed path command factories instead of rewriting the whole `d` attribute through
  local component string manipulation.
- 2026-07-03: Completed semantic point-editor command alignment. Structured point add and delete
  controls now dispatch operation-backed point command factories, so point rows and point structure
  actions all share durable command metadata with viewport point-handle editing.
- 2026-07-03: Converted SVG optimization from an opaque command closure to a document-level
  operation-backed command. `svg.optimize` now emits a serializable `svg.replace-root` operation
  with inverse metadata, giving whole-document optimizer passes the same history/replay path as
  granular edits.
- 2026-07-03: Began wiring UI panels through contributions. Panel contributions now preserve their
  render context generically, core workbench panels are installed through `corePanelContribution`,
  and the runtime panel registry can append custom panel contributions without editing the built-in
  panel array.
- 2026-07-03: Moved shortcut metadata onto contribution aggregation. Core shortcut definitions now
  live in `coreShortcutContribution`, settings/shortcut table rows derive from installed shortcut
  contributions, and runtime key handlers bind contribution IDs to action handlers without
  duplicating the shortcut list.
- 2026-07-03: Moved default viewport tool construction onto contribution aggregation. Touch, view
  navigation, element handles, transform boxes, and selection now install through
  `coreViewportToolContribution`, and custom viewport tool contributions can append factories while
  preserving the existing priority-sorted `ViewportToolRegistry` runtime.
- 2026-07-03: Turned the kernel contract into a shell runtime object. `createEditorKernel` now
  assembles document, command, selection, settings, viewport, resource, and registry services, and
  `createEditorAppController` exposes a live kernel built from the app's existing services plus
  core panel, shortcut, viewport-tool, and SVG contributions.
- 2026-07-03: Exposed the live kernel to panel render contexts. First-party panels still receive
  their existing focused props, but custom panel contributions can now read `context.kernel` for
  stable editor services without depending on shell-controller prop plumbing.
- 2026-07-03: Started migrating built-in panels onto kernel services. The code panel now reads
  document code, parse errors, apply-code, and formatter commands from `context.kernel`, removing
  those fields from the sidebar prop contract while preserving the existing CodePanel component API.
- 2026-07-03: Continued shrinking panel prop plumbing by routing preview and debug selected-node
  data through `context.kernel.selection.selectedNodes()`. The sidebar no longer passes a parallel
  `selectedNodes` prop for panels that can consume the selection service directly.
- 2026-07-03: Added a kernel document-action service and migrated inspector panel wiring onto
  kernel document, selection, command, and action services. The sidebar no longer passes inspector
  selection state, command dispatch, add-element/add-text actions, attribute/text update actions,
  or reorder callbacks as separate panel props.
- 2026-07-03: Finished migrating panel data plumbing onto kernel services. Document export text,
  element count, copy-SVG action, recent command event, held keys, and viewport pointer state now
  flow through the live kernel, leaving panel render contexts with only `kernel` plus the
  UI-specific context-menu opener.
- 2026-07-03: Added a narrow kernel UI service for node context menus and removed the last bespoke
  panel render prop. `EditorPanelContext` is now just the live kernel, so first-party and custom
  panels consume the same service object instead of shell-specific prop bags.
- 2026-07-03: Installed core document mutations through the command contribution registry.
  `coreCommandContribution` now exposes optimize, delete-selection, and duplicate-selection command
  factories from the live kernel, giving first-party mutations and future plugin commands the same
  registry path while preserving replayable operation-backed command output.
- 2026-07-03: Added registered-command runtime helpers and command contribution enablement. Kernel
  consumers can now find, query, and dispatch a command contribution by ID, which gives future
  command palettes, plugin hosts, and shortcut routing one shared execution path.
- 2026-07-03: Started routing shortcut metadata through command IDs. Shortcut descriptors now
  prefer command-ID handlers over shortcut-ID fallbacks, and the live app routes optimize plus
  duplicate shortcuts through `dispatchRegisteredCommand` while keeping delete on the action path
  because it still owns selection cleanup.
- 2026-07-03: Added user-facing action contributions beside pure document command contributions.
  `coreActionContribution` registers optimize, select-all, delete, duplicate, and move-selection
  actions with enablement, and the shell now exposes registered action handlers to shortcut
  routing so UI follow-up behavior can stay out of replayable command definitions.
- 2026-07-03: Added contribution registry diagnostics for extension safety. Registry aggregation now
  preserves duplicate entries but reports duplicate contribution IDs and duplicate per-registry item
  IDs, giving future plugin hosts and command palettes a stable conflict surface.
- 2026-07-03: Widened `EditorContributionContext.registries` to expose the full registry inventory
  to action, command, menu, and context-menu callbacks. Generic callbacks keep render contexts
  opaque, but can now inspect panels, modals, viewport stages, SVG capabilities, and renderers for
  discovery, diagnostics, and enablement logic.
- 2026-07-03: Surfaced contribution registry diagnostics in the Debug panel. Installed contribution
  counts and duplicate-registry issues are now visible from the live workbench, giving extension
  authors a concrete conflict/debug surface instead of leaving registry diagnostics test-only.
- 2026-07-03: Extended contribution registry diagnostics to report missing app-menu action targets
  and missing shortcut action/command targets. Dangling extension references now surface as
  structured registry issues instead of silently becoming disabled menu items or unbound shortcuts.
- 2026-07-03: Replaced shortcut `commandId` overloading with explicit shortcut targets. Shortcut
  contributions now target an action, command, or host handler through a discriminated union, and
  runtime shortcut resolution uses separate action, command, and handler maps so plugin shortcuts do
  not depend on ambiguous string matching.
- 2026-07-03: Slimmed runtime shortcut routing down to installed shortcut contributions plus
  injected action, command, and host-handler registries. The shell no longer passes every built-in
  editor callback into `createEditorShortcuts`; registered actions and commands own their bindings,
  with path-command insertion remaining as the explicit host handler.
- 2026-07-03: Added a headless command palette model over registered actions and commands. Palette
  items now expose kind, ID, label, enabled state, shortcut labels, and a shared run callback, giving
  future command palettes, menus, and plugin hosts one query surface for user-facing editor actions.
- 2026-07-03: Centralized first-party app contribution assembly in the shell. The controller now
  installs `coreEditorAppContributions` plus optional external app contributions, so extension
  points append through the same registry aggregation and diagnostic path as built-in features.
- 2026-07-03: Started consuming app-installed SVG capability contributions in shell behavior.
  Document add-element actions and derived selection handles now receive the app SVG capability
  registry built from installed contributions instead of always using the global core registry.
- 2026-07-03: Threaded app SVG capability registries through the document lifecycle. Initial
  documents, code parsing, imports, undo/redo restoration, transaction rollback, diagnostics, and
  operation-backed structural moves now use the shell-installed SVG capabilities.
- 2026-07-03: Exposed the app SVG capability registry on the live kernel and routed inspector
  metadata reads through it. Inspector add menus, tree drag validation, element icons,
  supported-element checks, attribute ordering, and numeric controls now respect installed SVG
  capability contributions.
- 2026-07-03: Connected app-installed viewport tool contributions to the live viewport interaction
  runtime. The shell now passes aggregated tool contributions into `createViewportInteractions`,
  so contributed tools can participate in canvas, node, handle, and transform-box event routing.
- 2026-07-03: Turned renderer contributions into a live SVG node rendering extension point.
  Renderer contributions can now provide an `SvgNodeRendererAdapter`, and the shell resolves the
  installed app renderer registry into the viewport's vector layer while preserving the default
  Solid/SVG renderer as the fallback.
- 2026-07-03: Promoted the resolved SVG node renderer into a kernel rendering service and routed
  preview panels through it. The full-document and selected-object previews now share the same
  app-installed SVG node renderer as the main viewport instead of bypassing the renderer boundary.
- 2026-07-03: Added a durable restore-location operation for structural node moves. Multi-node
  reorders now derive inverse operation metadata from original parent/index snapshots, including
  moves spanning multiple parents, instead of dropping reorder history back to opaque root
  snapshots.
- 2026-07-03: Made document undo/redo prefer operation replay before snapshot fallback. History
  entries now restore through inverse operations for undo and forward operations for redo when that
  metadata exists, while legacy commands still use cloned root snapshots as the compatibility path.
- 2026-07-03: Promoted viewport renderer measurement and hit-testing contracts into the kernel
  rendering service. The DOM adapter still provides the live implementation, but extensions can now
  discover the same measurement, marquee hit-test, event-target, overlay, and viewport-rect services
  through `kernel.rendering.viewportRenderer`.
- 2026-07-03: Surfaced the headless command palette as a kernel-backed modal. `Ctrl+K` now opens a
  searchable palette that projects registered actions and commands from installed contributions,
  so first-party and future plugin commands become runnable through the same user-facing surface.
- 2026-07-03: Routed shortcut documentation through the live shortcut contribution registry. The
  Shortcuts modal and Settings shortcut tab now list installed app shortcut contributions instead of
  a static core-only shortcut table, so plugin shortcuts are visible wherever users inspect bindings.
- 2026-07-03: Promoted first-party host commands into registered action contributions. Import,
  export, save, new tab, undo/redo, copy SVG, view zoom/toggles, settings, shortcuts, about, donate,
  and the command palette now share the same action registry path as document actions, while core
  shortcuts target those actions instead of private shell handlers.
- 2026-07-03: Moved node context menus onto contribution aggregation. The shell now renders menu
  items projected from installed context-menu contributions, so core and future plugin commands can
  add, order, enable, hide, and run node-scoped menu actions without editing a shell switch.
- 2026-07-03: Collapsed context-menu item projection into `EditorContextMenu`. The shell now passes
  only the active menu position and close handler, while the component reads installed context-menu
  contributions from the live kernel.
- 2026-07-03: Promoted context-menu active/open/close state into the kernel UI service.
  `EditorContextMenu` now renders from `kernel.ui.contextMenu`, and inspector/viewport entry points
  open the same service-backed menu without an app-level `contextMenu` controller prop bag.
- 2026-07-03: Added action-backed context-menu contributions. Core duplicate, move, and delete
  node menu items now declaratively target registered actions, while custom callback menu items
  remain supported; registry diagnostics also catch missing context-menu action targets.
- 2026-07-03: Moved top-bar application menus onto contribution aggregation. First-party toolbar
  buttons, the tabs-strip new-tab affordance, the file-action strip, and the More popover now
  render from installed app-menu contributions that target registered actions or links.
- 2026-07-03: Collapsed the remaining top-bar shell prop bag. `TopBar` now reads document tabs and
  app-menu projections from the live kernel, so extension menu items and document tab state flow
  through the same contribution-backed service boundary as the rest of the chrome.
- 2026-07-03: Connected panel contributions to the visible sidebar tab strip. `EditorSidebar` now
  projects installed panel contributions from the live kernel registry for both tabs and active
  panel rendering, so custom panels appear in the workbench without editing static panel arrays.
- 2026-07-03: Added explicit ordering to panel contributions. Core panels reserve stable order
  slots while unordered extension panels still append after the built-ins, letting plugins place
  panels before, between, or after first-party workbench panels without relying on load order.
- 2026-07-03: Moved modal rendering onto contribution aggregation. Built-in settings, export,
  about, donate, shortcuts, and command-palette dialogs now install through `coreModalContribution`,
  and `EditorModalStack` renders the active modal from the live kernel registry.
- 2026-07-03: Promoted modal runtime state into the kernel UI service. Modal actions now call
  `kernel.ui.modal.open`, `EditorModalStack` reads `kernel.ui.modal.active`, and modal
  contributions receive a close handler backed by `kernel.ui.modal.close`.
- 2026-07-03: Promoted SVG import and reference-image file picker host wiring into kernel UI
  services. `EditorFileInputs` now renders from `kernel.ui.svgImport` and
  `kernel.ui.referenceImage`, removing the shell-specific `fileInputs` controller prop bag while
  keeping file dialogs available to registered actions and viewport toolbar contributions.
- 2026-07-03: Extended the SVG import UI service to own drag/drop host state and handlers.
  App-level drag events now delegate to `kernel.ui.svgImport`, and `SvgDropOverlay` renders from
  the same service-backed `dropActive` signal instead of a separate controller `dropOverlay` prop.
- 2026-07-03: Promoted workbench panel state and sidebar resizing into a kernel UI service.
  `EditorSidebar` and the workspace splitter now consume `kernel.ui.workbench`, leaving the shell
  controller without a `workspace` prop bag for panel selection or sidebar resize handlers.
- 2026-07-03: Promoted app root host state into `kernel.ui.appHost`. The root element now receives
  its ref callback, theme variables, and drop-active class through a service contract instead of the
  shell controller's `root` prop bag, keeping fullscreen and app theming on the kernel boundary.
- 2026-07-03: Collapsed the last viewport context prop bag out of the shell controller.
  `EditorViewport` can now take the live `EditorKernel` directly for the first-party app path while
  keeping its explicit host/layer/overlay props for isolated tests and custom host scenarios.
- 2026-07-03: Split app root host setup into `createAppHostServices`. Root ref capture, theme
  projection, drop-active class state, and fullscreen toggling now have a focused service factory
  and tests instead of living inline inside the shell composition root.
- 2026-07-03: Split shortcut listener setup into `createEditorShortcutRuntime`. Active-element
  tracking, registered action/command handler projection, and the window `keydown` listener now live
  behind a shell runtime factory, leaving the controller to provide only the live kernel and the
  path-command insertion host handler.
- 2026-07-03: Split viewport assembly into `createEditorViewportServices`. DOM host refs, pointer
  state, renderer adapter composition, camera sizing, viewport interactions, derived raster/export
  state, and host/layer/overlay service projections now have a focused runtime factory, leaving the
  shell controller to pass document, selection, command, reference, and contribution inputs.
- 2026-07-03: Split selection assembly into `createEditorSelectionServices`. Typed selection
  reconciliation now returns the kernel `SelectionService`, document selection-reset callback, and
  path-command shortcut handler from one focused service factory instead of wiring selection internals
  directly in the shell controller.
- 2026-07-03: Split file/reference host setup into `createEditorFileHostServices`. SVG import
  dialogs, drag/drop state and handlers, reference-image input state, and their kernel UI service
  projections now live behind a focused factory, so the shell controller passes a single file host
  service into app-host, viewport, and kernel UI assembly.
- 2026-07-03: Split workbench and overlay UI state into `createEditorWorkbenchServices` and
  `createEditorOverlayServices`. Panel selection, sidebar resizing, modal state, context-menu
  selection/open/close behavior, and the viewport context-menu clearing bridge now have focused
  service factories instead of raw shell-controller signals.
- 2026-07-03: Split document runtime assembly into `createEditorDocumentServices`. Document
  creation, command-event tracking, command service projection, resource lookup service projection,
  document service projection with viewport-derived export metadata, and save/copy host actions now
  live behind a focused runtime factory instead of being assembled inline in the shell controller.
- 2026-07-03: Moved Settings modal sections onto contribution aggregation. The built-in
  formatting, optimizer, palette, shortcut, theming, tabbar, and other settings tabs now install
  through `coreSettingsSectionContribution`, and custom settings sections render through the same
  live kernel registry.
- 2026-07-03: Extended history entries with explicit `beforeRoot` and `afterRoot` metadata while
  preserving the existing `root` snapshot fallback. Operation-backed history still replays
  operations/inverse operations first, and legacy commands now expose their before/after roots for
  future history tooling without changing undo/redo behavior.
- 2026-07-03: Added explicit command `mergeKey` metadata and taught document history to replace the
  previous compatible history entry from its original `beforeRoot`. Repeated scalar, point,
  path-anchor, transform, and text-node updates now collapse into one undo step while unrelated
  command updates continue to produce separate history entries.
- 2026-07-03: Moved viewport drag controllers onto explicit `CommandTransaction` objects. Selection
  moves, transform-box drags, and element-handle drags now retain the transaction returned from
  `beginCommandTransaction()` and call `update`, `commit`, or `cancel` on that object instead of
  threading raw update/commit callbacks through every viewport tool controller.
- 2026-07-03: Made modal-opening actions declarative contribution targets. `ActionContribution`
  still supports callback actions, but actions can now declare `kind: "modal"` with a modal ID, the
  registered-action runtime opens it through the kernel UI service, and registry diagnostics report
  modal actions that point at missing modal contributions.
- 2026-07-03: Made command durability explicit in the command contribution contract. Registered
  commands now declare whether they are operation-backed or legacy with a reason, the command
  palette model carries that metadata, and registry diagnostics flag legacy command contributions
  that omit a meaningful compatibility reason.
- 2026-07-03: Split registered command contributions into operation-backed and legacy variants.
  Operation command contributions now provide `createOperations(kernel)` and are wrapped by the
  command registry into replayable `EditorCommand` objects, while legacy command contributions keep
  the explicit `createCommand(kernel)` adapter path plus their compatibility reason.
- 2026-07-03: Added command-targeted action contributions. User-facing actions can now declare
  `kind: "command"` with a registered command ID, the action registry dispatches through the
  command registry, diagnostics flag missing command targets, and the core Optimize action now uses
  the registered `svg.optimize` command path instead of a document-action callback bridge.
- 2026-07-03: Added operation-backed context-menu command items. Context-menu contributions can now
  declare `kind: "command"` with a durable command ID plus `createOperations(context)`, and the
  runtime wraps those operations into replayable commands. The core "Insert group after" node menu
  item now uses this contract instead of a custom callback that manually dispatches a command.

## Migration Plan

### Phase 1: Lock Down Contracts Without Changing Behavior

1. Add `src/editor/kernel.ts` with service interfaces and registry interfaces.
2. Add serializable `EditorOperation` types and an `applyOperation(root, operation)` reducer.
3. Wrap existing closure commands so `dispatchCommand` can accept both old commands and new
   operation-backed commands.
4. Move node actions from `createSvgNodeActions.ts` into command factory modules:
   `commands/nodeCommands.ts`, `commands/attributeCommands.ts`, `commands/pathCommands.ts`.
5. Add tests for operation apply/invert/merge behavior before touching viewport code.

### Phase 2: Make History Transactional

1. Replace raw `beginCommandTransaction/updateCommandTransaction/commitCommandTransaction` with a
   `CommandTransaction` object.
2. Support `cancel()` that restores the transaction base root without pushing history.
3. Use merge keys for drag updates so move/resize/handle drags become one undo entry.
4. Track history entries as operations plus before/after metadata. Keep snapshot fallback until the
   operation model is complete.

### Phase 3: Split Viewport Tools

1. Keep `ViewportToolRegistry` and move current behavior into separate files under
   `features/viewport/tools`.
2. Give each tool only a `ToolContext` with command dispatch, selection, viewport math, renderer
   adapter, and settings.
3. Move DOM measuring out of tools into a measurement adapter.
4. Add tests for event priority, transaction lifecycle, cancel behavior, and selection results.

### Phase 4: Convert SVG Metadata To Contributions

1. Move `svg-db.ts` data into `editor/svg-capabilities/coreSvgContribution.ts`.
2. Move `handles.ts` element switches into per-element handle providers.
3. Move inspector controls into attribute control providers.
4. Register gradients, resources, text, filters, masks, and symbols as separate capability groups.
5. Add diagnostics for unknown attributes, invalid child relationships, broken references, duplicate
   IDs, and unsupported SVG constructs.

### Phase 5: Renderer Boundary And Pro Scale

1. Formalize `RendererAdapter` for render, measure, hit-test, and event target lookup.
2. Keep current Solid/SVG renderer as the exact visual baseline.
3. Add a spatial index for large documents.
4. Add document-level resource graph queries for references and inherited styles.
5. Only after these contracts exist, consider alternate canvas/WebGPU rendering or worker-backed
   parsing/formatting.

## First Implementation Moves

1. Create `editor/operations.ts` and convert `setAttribute`, `removeAttribute`, `insertNode`,
   `removeNode`, and `moveNodes` to operation-backed commands.
2. Refactor `createSvgNodeActions.ts` so it only computes user intent and dispatches command
   factories.
3. Add `cancelCommandTransaction` and use it from pointer cancel paths.
4. Split `createViewportInteractions.ts` into `viewNavigationTool.ts`, `selectionTool.ts`,
   `moveTool.ts`, `handleTool.ts`, and `transformTool.ts`.
5. Replace `selectedPathCommand` with the first version of typed `SelectionTarget`.
6. Convert `svg-db.ts` into a capability contribution while preserving the current exported
   `svgCapabilities` adapter.
7. Add tests for the first migrated command factories and the transaction lifecycle.

## Quality Bar For New Features

- A new SVG element should be added by registering a capability contribution, not by editing the
  inspector, handles, renderer, and add menu separately.
- A new tool should be added by registering a tool contribution, not by modifying
  `createViewportInteractions.ts`.
- A new command should be serializable or have a clear legacy adapter reason.
- A new top-level menu or toolbar action should be added by registering an app-menu contribution
  that targets a registered action or link, not by editing `TopBar`.
- A drag interaction should have explicit begin, update, commit, and cancel behavior.
- UI panels should register as panel contributions, appear through the live panel registry, and
  consume `EditorKernel` service contracts instead of bespoke controller prop bags.
- UI modals should register as modal contributions and render from the live modal registry, not a
  hard-coded modal switch.
- Settings pages should register as settings-section contributions instead of editing the Settings
  modal tab list directly.
- DOM measurement and hit testing should go through renderer/measurement adapters.
- Every extension contract should have focused tests that run without a browser.
- Extension packages should declare the current editor extension API version so package hosts can
  diagnose compatibility before treating package metadata as stable.
- Extension packages should declare required package dependencies so future enablement and load-order
  flows can fail with package-level diagnostics instead of scattered missing contribution errors.
- Active extension packages should flatten contributions in dependency-before-dependent order, and
  dependency cycles should be reported as package diagnostics before contribution installation.
- Package hosts should read activation state from registry package states rather than re-deriving
  whether package-level diagnostics block a package.
- Package hosts should read active package load order from registry package load order rather than
  inferring dependency order from flattened contribution arrays.
- Package hosts should read dependency impact from registry package dependency graph rather than
  rebuilding declared dependencies and reverse dependents in each UI surface.
- Package hosts should read contribution provenance from registry contribution sources rather than
  guessing whether a contribution came from core, raw external installs, direct registries, or a
  package.
- Registry diagnostic projections should consume contribution provenance so extension authors can
  trace duplicate items, missing references, and invalid registry entries back to their owner.
- Package hosts should read registry health from `EditorRegistries.health` instead of duplicating
  package, contribution, and diagnostic severity counts in Settings, Debug, or enablement UI.
- Package enablement policy should flow through install options such as `disabledPackageIds`, leaving
  inventory visible while disabled packages and packages that depend on them stay out of live registries.
- Blocked package contributions should be withheld from live registries while their manifest inventory
  and diagnostics remain visible to package-host UI.

## Verification Snapshot

On 2026-07-03:

- `pnpm --filter @app-game/solid-svg-editor test` passed: 53 test files, 239 tests.
- `pnpm --filter @app-game/solid-svg-editor build` passed: `tsc -b` and Vite production build.

## Roadmap Notes

- 2026-07-03: Moved the core Duplicate action onto the command-targeted action path so toolbar,
  shortcut, palette, and context-menu entry points share the registered `svg.duplicate-selection`
  command contract.
- 2026-07-03: Added registered `svg.move-selection-up` and `svg.move-selection-down` operation
  commands and routed the core Move Up/Down actions through them.
- 2026-07-03: Selection now reconciles stale node/path targets against the current document root,
  allowing the core Delete action to use the registered `svg.delete-selection` command path.
- 2026-07-03: Add-element and add-text document actions now delegate parent resolution and insert
  command construction to node command factories.
- 2026-07-03: Path-command keyboard insertion now uses a path command intent factory that owns key
  normalization, command creation, and next selection target calculation.
- 2026-07-03: Removed stale `DocumentActionService` edit/optimize methods now covered by registered
  commands, narrowing document actions to UI-specific document intents.
- 2026-07-03: Core shortcuts for optimize/delete/duplicate/move now target registered commands
  directly instead of command-backed action aliases.
- 2026-07-03: Context-menu contributions can target registered commands directly, and core
  duplicate/move/delete context items no longer require command-backed action aliases.
- 2026-07-03: App-menu contributions can target registered commands directly, and the core
  Optimize top-bar item now dispatches `svg.optimize` without a command-backed action alias.
- 2026-07-03: Removed the remaining first-party command-backed action aliases for optimize,
  delete, duplicate, and move; command palette, shortcuts, app menus, and context menus now expose
  those document mutations through registered command contributions directly.
- 2026-07-03: SVG attribute control contributions now receive the active root, capability registry,
  command dispatcher, and selection-target setter, giving custom inspector controls access to
  editor services without bespoke panel prop threading.
- 2026-07-03: The core Inspector panel now consumes the live `EditorKernel` directly from its panel
  contribution instead of expanding document, selection, command, capability, UI, and action
  services into a registry-level prop bag.
- 2026-07-03: Inspector add/reorder/attribute/text mutations now dispatch command factories from
  kernel services directly, the old broad `createSvgNodeActions` helper has been replaced by a
  path-command keyboard helper, and `DocumentActionService` has been removed from the kernel in
  favor of focused document, UI, command, and selection services.
- 2026-07-03: Moved core shape and path handle creation into per-element SVG capability providers.
  `handles.ts` now owns only handle traversal and transform projection, while the core shape
  contribution attaches circle, ellipse, rect, line, point-list, and path providers directly.
- 2026-07-03: Moved spatial-index bounds into SVG capability contributions. `svg-spatial-index.ts`
  now owns traversal, transforms, and query behavior while element-local bounds come from the active
  capability registry, including custom extension elements and the new non-addable core image
  capability.
- 2026-07-03: Retired `selectedPathCommand` from the public selection service and inspector
  contracts. Path command rows now derive active state from typed `SelectionTarget` values, and
  `createEditorSelection` stores path command and anchor choices only as normalized selection
  targets.
- 2026-07-03: Made `createSvgCapabilityRegistry` contribution-backed instead of falling back to
  `svg-db` for built-in elements, attribute metadata, icons, and child validation. Core SVG metadata
  still seeds the default registry through `coreSvgCapabilityContribution`, while ad hoc registries
  now expose only the contributions they explicitly install.
- 2026-07-03: Made `getSvgAttribute` explicit-default-only. Core handle and bounds providers now opt
  into core SVG defaults themselves, so the shared model helper no longer reaches into `svg-db` and
  extension code does not inherit core metadata by accident.
- 2026-07-03: Moved SVG attribute type contracts into `editor/svg-attribute-types.ts`. Public editor
  contracts now depend on editor-owned SVG attribute types instead of importing from the legacy
  `svg-db` metadata module, with a guard test covering the kernel and capability registry contracts.
- 2026-07-03: Moved first-party SVG metadata ownership into
  `editor/svg-capabilities/coreSvgMetadata.ts`. The legacy `svg-db.ts` module now re-exports that
  capability-owned metadata as a compatibility facade, and architecture tests guard core SVG
  capability code against importing the facade.
- 2026-07-03: Threaded typed selection targets into viewport layer and SVG node renderer contracts.
  Layer contributions and renderer contributions now receive `SelectionTarget[]` alongside the
  legacy selected-node ID projection, so future anchor, gradient-stop, text-range, and plugin
  renderers can inspect richer selection state without reaching back into shell services.
- 2026-07-03: Extended viewport selection-box measurement requests with typed `SelectionTarget[]`.
  The DOM renderer adapter still measures node targets as the visual baseline and falls back to the
  legacy selected-ID projection for compatibility, while renderer contributions can now inspect
  richer selection state during measurement.
- 2026-07-03: Added typed marquee hit testing to the viewport renderer contract. DOM hit testing
  still projects rendered SVG nodes into node selection targets, while selection-tool marquee flow
  now consumes `SelectionTarget[]` so contributed renderers can return richer targets without the
  tool collapsing them to node IDs.
- 2026-07-03: Added typed event-target selection to the viewport renderer contract. DOM event
  lookup still preserves the legacy node-ID resolver, but canvas selection now consumes
  `SelectionTarget` hits so renderer contributions can select richer target kinds directly.
- 2026-07-03: Added typed selection-target pointer routing for SVG node renderers. The default
  Solid/SVG renderer now sends node clicks through `SelectionTarget`, while layer services, viewport
  tools, and custom renderers still retain the legacy node-pointer callback for compatibility.
- 2026-07-03: Extended context-menu state and contribution contexts with typed `SelectionTarget`
  data. Existing node-scoped menu items still receive `nodeId`, while custom renderers and future
  target-specific menus can open and filter actions by the richer selection target.
- 2026-07-03: Made the registered `svg.delete-selection` command consume typed selection targets.
  Path-command and path-anchor selections now delete the active path command through operation-backed
  path data updates, while ordinary node selections keep the existing remove-node behavior.
- 2026-07-03: Tightened typed selection reconciliation for path targets. Path-command selections now
  require the referenced command index to exist, and path-anchor selections also require the command
  parameter to exist, so path-data edits cannot leave stale anchor or command selections behind.
- 2026-07-03: Added reusable path-command edit intents for insert/delete operations. Inspector path
  command controls now dispatch operation-backed commands and receive the next typed selection target
  from the command layer instead of duplicating path index recovery in UI code.
- 2026-07-03: Made core context menus target-aware. Node mutation items are now visible only for
  node targets, while path-command and path-anchor targets expose a path-command delete item that
  dispatches the shared delete intent and selects the next surviving path command.
- 2026-07-03: Tightened the element handle descriptor contract into a true command-vs-legacy
  discriminated union. Command-backed handles now expose only `createCommand`, legacy handles keep
  the `update` adapter, and transformed core handles stay operation-backed without carrying closure
  mutation fallbacks.
- 2026-07-03: Retired legacy node-ID callbacks from the public viewport renderer adapter contract.
  Renderer contributions now expose typed marquee and event-target selection methods directly,
  while the DOM adapter keeps node-ID lookup as a private implementation detail.
- 2026-07-03: Removed the `src/svg-db.ts` compatibility facade after first-party code moved to
  SVG capability-owned metadata. Architecture contract tests now guard that the retired facade stays
  absent and core capability modules remain upstream of legacy metadata imports.
- 2026-07-03: Clarified snapshot-backed history fallback semantics. Legacy closure commands now
  undo from `beforeRoot` and redo from `afterRoot`, document history moves entries directly between
  the undo and redo stacks, and replay no longer drops command labels or command IDs into anonymous
  snapshot entries.
- 2026-07-03: Added command durability metadata to dispatched commands and history entries.
  Operation-backed commands now carry `kind: "operation"`, legacy command adapters carry an explicit
  reason, and registered legacy command contributions transfer their durability reason onto the
  actual dispatched command object.
- 2026-07-03: Added a real sample extension contribution under `src/extensions`. The sample now
  installs an SVG capability, operation-backed command, app-menu item, context-menu command, shortcut,
  modal action, modal contribution, viewport tool, renderer adapter, viewport overlay, custom inspector
  control, settings section, panel, and custom diagnostics through the same app contribution pipeline
  that first-party features use, with focused tests and packaging notes proving those extension
  contracts compose through the live kernel.
- 2026-07-03: Opened `SvgResourceKind` to extension-defined resource classes and extended the sample
  SVG capability with a custom resource element plus reference attribute. App-installed capabilities
  now prove custom resource indexing, resource-graph resolution, and broken-reference diagnostics
  without forcing plugins to masquerade as core paint servers, patterns, filters, or symbols.
- 2026-07-03: Added a reusable registry diagnostic projection with severity, detail, and fix guidance.
  The Debug panel now renders actionable diagnostics from that projection instead of formatting raw
  registry issues locally, giving future package hosts and extension authoring surfaces one shared
  way to explain contribution conflicts.
- 2026-07-03: Added a manifest-backed `EditorExtensionPackage` boundary. The shell can still install
  raw contributions for tests and migration work, but `createEditorAppController` now accepts
  packages and flattens their contributions into the same core registry path, while the sample
  extension exports a package manifest as the preferred external install shape.
- 2026-07-03: Surfaced installed extension package inventory through `EditorRegistries`. App package
  installs now retain manifest metadata plus contribution IDs in the live kernel, and the Debug panel
  renders installed package count/details alongside registry diagnostics so package-host state is
  visible without reverse-engineering the flattened contribution list.
- 2026-07-03: Added package-level registry diagnostics for duplicate package IDs and invalid package
  manifests. Package host validation now shares the same issue list and actionable diagnostic
  projection as contribution conflicts, so malformed packages are visible before their flattened
  contributions are inspected.
- 2026-07-03: Added a core Settings section for installed extensions. Package inventory and shared
  registry diagnostics now render in the Settings modal as well as the Debug panel, giving extension
  authors a normal host surface for package metadata, contribution IDs, and manifest/registry issues.
- 2026-07-03: Added an explicit editor extension API version to package manifests. Package diagnostics
  now flag packages targeting a different API version, giving future package hosts a stable
  compatibility check before adding enablement, migration, or dependency workflows.
- 2026-07-03: Added package dependency metadata and registry diagnostics for missing or exact-version
  mismatched package dependencies. Settings and Debug now show package API versions, contribution IDs,
  and dependency summaries from the same installed-package inventory.
- 2026-07-03: Added package activation state projection to `EditorRegistries`. Each installed package
  now has an `active` or `blocked` state derived from package-level diagnostics, and Settings/Debug
  render that status beside the manifest inventory.
- 2026-07-03: Made shell package installation dependency-aware. Blocked packages, including packages
  that depend on another blocked package, keep their inventory and diagnostics but no longer flatten
  their contributions into live app registries.
- 2026-07-03: Added host-level package disablement policy. Shell install options can now pass
  `disabledPackageIds`; disabled packages and otherwise-valid packages depending on them remain in
  package inventory but do not flatten contributions into the live app registries.
- 2026-07-03: Made active package installation dependency-ordered and added dependency-cycle
  diagnostics. Package contributions now flatten after their active dependencies, while cyclic
  package groups and packages depending on them stay in inventory but out of live registries.
- 2026-07-03: Added explicit package load-order projection to `EditorRegistries`. Settings and Debug
  now show each installed package's effective active load position or `not loaded`, so package hosts
  can inspect dependency-resolved installation without reverse-engineering contribution order.
- 2026-07-03: Added contribution provenance projection to `EditorRegistries`. The shell now records
  core, raw external, and package-backed sources for live contributions, while generic registries fall
  back to direct-install sources; Debug renders the source list for extension authoring.
- 2026-07-03: Threaded contribution provenance into shared registry diagnostics. Settings and Debug
  diagnostics can now explain duplicate contribution IDs, duplicate registry IDs, missing references,
  and invalid registry items with core/raw/direct/package source context.
- 2026-07-04: Added registry health projection to `EditorRegistries`. Settings and Debug now read a
  shared status/count summary for package activation, contribution count, and diagnostic severity
  counts instead of recalculating host health locally.
- 2026-07-04: Added package dependency graph projection to `EditorRegistries`. Settings and Debug now
  show reverse dependency impact (`required by ...`) from the shared graph so future enablement UI can
  explain which installed packages depend on a package before disabling it.
- 2026-07-04: Added persisted extension package enablement settings. The kernel settings service now
  exposes disabled package IDs plus an enable/disable helper, the default shell applies that persisted
  policy at startup, and Settings renders package enablement controls while keeping live package
  unload/reload as an explicit future runtime-lifecycle project.
- 2026-07-04: Added package API compatibility and migration projections. Package manifests can now
  declare editor API migration steps, `EditorRegistries` exposes compatibility status per installed
  package, and Settings/Debug show compatible, migration-required, or incompatible API state while
  registry diagnostics keep stale or future-API packages out of live contribution registries.
- 2026-07-04: Added persisted package migration acceptance. The settings service now stores applied
  package migration keys, Settings can mark a package migration path applied, and startup registry
  resolution treats packages with every required key as `migrated` so their contributions can install
  through the normal dependency and activation pipeline.
- 2026-07-04: Added host-provided package update discovery. `EditorRegistries` now projects available
  update candidates per installed package, shared diagnostics warn about ready or incompatible updates
  without blocking the current package, and Settings/Debug render update status beside compatibility,
  migration, dependency, and load-order metadata.
- 2026-07-04: Added startup package update application. Hosts can provide updated package payloads,
  Settings can persist an accepted package/version update key, and the shell replaces matching
  installed packages before constructing registries, capabilities, renderers, shortcuts, and the live
  kernel on the next startup.
