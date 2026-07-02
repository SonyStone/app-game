I audited the active editor in [apps/solid-svg-editor](/workspaces/app-game/apps/solid-svg-editor/package.json:1), not the older [packages/svg-editor](/workspaces/app-game/packages/svg-editor/readme.md:1) prototype. The current app is much better than “student project” code in compiler hygiene: strict TS is on, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in [tsconfig.app.json](/workspaces/app-game/apps/solid-svg-editor/tsconfig.app.json:16). `pnpm --filter @app-game/solid-svg-editor build` passes.

**Verdict**
The app has a workable prototype foundation, but not yet an Illustrator-class architecture. The biggest issue is that extensibility is organized by feature files, not by stable editor contracts. New capabilities currently have to thread through the app controller, viewport interactions, inspector, shortcuts, SVG DB, handles, and history by hand.

**Main Risks**

1. The shell is a large wiring hub: [createEditorAppController.ts](/workspaces/app-game/apps/solid-svg-editor/src/features/shell/createEditorAppController.ts:23) composes almost every subsystem and returns UI-shaped callback bags through line 410.

2. Undo/history is snapshot-based, not command-based: [createEditorDocuments.ts](/workspaces/app-game/apps/solid-svg-editor/src/features/documents/createEditorDocuments.ts:17) stores mutable `past`/`future` arrays, and mutations manually call `pushHistory`, `replaceRootWithoutHistory`, and `syncActiveRootCode`.

3. Tools are implicit. [createViewportInteractions.ts](/workspaces/app-game/apps/solid-svg-editor/src/features/viewport/createViewportInteractions.ts:35) is effectively a monolithic select/pan/rotate/marquee/transform/touch tool.

4. SVG capabilities are hard-coded. Element specs live in [svg-db.ts](/workspaces/app-game/apps/solid-svg-editor/src/svg-db.ts:20), handles switch by element name in [handles.ts](/workspaces/app-game/apps/solid-svg-editor/src/editor/handles.ts:53), and inspector controls switch by attribute type in [InspectorInputs.tsx](/workspaces/app-game/apps/solid-svg-editor/src/features/inspector/InspectorInputs.tsx:219).

5. Rendering is too direct for a pro editor. [ViewportParts.tsx](/workspaces/app-game/apps/solid-svg-editor/src/features/viewport/ViewportParts.tsx:126) renders model nodes via Solid `Dynamic` and raw attrs. Nice, but future hit testing, unsupported SVG behavior, resource resolution, and alternate renderers need a policy layer.

**Foundation Pattern To Add**
Make the app revolve around registries and commands:

- `SvgDocument` core: immutable document tree, typed IDs, resource graph, selectors, parser/serializer adapters.
- `EditorCommand`: `{ id, label, apply, invert?, merge? }`, plus transactions for drags.
- `ToolRegistry`: tools own pointer/keyboard lifecycle and emit commands, overlays, cursors, snapping requests.
- `SvgCapabilityRegistry`: element specs contribute defaults, valid children, attribute schemas, inspector controls, handles, converters, validators.
- `RendererAdapter`: separate document rendering, overlay rendering, measuring, and hit testing.
- `PanelRegistry` and `ShortcutRegistry`: UI becomes contributed surfaces, not hard-coded prop plumbing.

**Best First Moves**

1. Extract commands first. Move `deleteSelected`, `duplicateSelected`, `moveSelected`, `updateElementAttribute`, and path edits behind `dispatch(command)`.
2. Replace drag history handling with `beginTransaction/updateTransaction/commitTransaction/cancelTransaction`.
3. Split `createViewportInteractions` into `selectTool`, `panTool`, `transformTool`, and `pathEditTool`.
4. Turn `svg-db.ts`, `handles.ts`, and `InspectorInputs.tsx` into a capability registry.
5. Add unit tests around `svg-model.ts`, `path-data.ts`, transforms, and command undo/redo. There are no app-local tests right now.
6. Decide whether `packages/svg-editor` is dead legacy or a future shared core. Right now it duplicates concepts and its README marks it as GodSVG-derived exploration.

Goal marked complete. Tracker reported 216,443 tokens and about 2m53s elapsed.
