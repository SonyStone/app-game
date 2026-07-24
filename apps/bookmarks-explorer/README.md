# Bookmarks Explorer

SolidJS viewer and editor for browser tabs, bookmarks, history, and saved sessions.

## Development surfaces

```bash
pnpm --filter @app-game/bookmarks-explorer dev
pnpm --filter @app-game/bookmarks-explorer dev:extension
```

The standalone web app runs at `http://localhost:3160/`. It is also mounted in
`@app-game/web` at `/bookmarks-explorer`.

The extension watch build is written to `dist-extension`. Load that directory
as an unpacked extension from `chrome://extensions`.

Each pane can independently display the live browser/local backend, the left
editable file, or the right editable file. Drop a versioned Bookmarks Explorer
JSON document or newline-oriented URL text file directly onto a pane to open it.
Drag a tree item onto another tree to move or copy it, or out to the desktop in
Chromium to save that item as portable JSON.

Portable drag-and-drop uses the versioned explorer payload together with
`application/json`, `text/uri-list`, and `text/plain` representations. Drops
within one backend retain native move behavior; drops between browsers or files
copy portable content so the source is not deleted before import succeeds.

## Architecture

The application is composed from four dependency layers:

- `src/tree-view` contains the generic virtual tree renderer and headless
  expansion model. `@app-game/solid-virtual` limits each recursive level to the
  viewport while preserving the connected tree markup. Keyboard/selection
  state, scroll restoration, native drag gestures, the selection indicator,
  and the drop indicator are independent opt-in modules; the base `TreeView`
  requires none of them.
- `src/explorer` contains tabs/bookmarks/history models, drop policy, commands,
  portable JSON/text codecs, and Solid resource orchestration. It has no
  browser-extension API calls.
- `src/backends` implements the explorer backend contract. Chrome API usage is
  confined to `backends/chrome`; the regular website uses an editable workspace
  initialized from Tabs Outliner data in `backends/fixtures`, editable files use
  `backends/document`, while `backends/web` remains the empty fallback for
  hosts without local or browser data.
- `src/App.tsx` is the composition root that injects a backend and opts into the
  interaction and visual layers needed by Bookmarks Explorer.

Future Firefox, import/export, IndexedDB, or synchronized-server support should
implement `ExplorerBackend` without changing the TreeView or explorer policy.
