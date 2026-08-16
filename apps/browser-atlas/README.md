# Browser Atlas

Map and edit browser tabs, bookmarks, history, and saved sessions with SolidJS.

## Development surfaces

```bash
pnpm --filter @app-game/browser-atlas dev
pnpm --filter @app-game/browser-atlas dev:extension
```

The standalone web app runs at `http://localhost:3160/`. It is also mounted in
`@app-game/web` at `http://localhost:3120/browser-atlas`.

The shared web route uses a persistent mock-browser backend rather than static
fixtures. It includes multiple live windows, saved and crash-recovered sessions,
groups, notes, separators, and arbitrary nested descendants. Mutations survive
reload through `localStorage`, so extension features can be exercised without
touching a personal browser profile.

The header's **Help** dialog documents current tree workflows, recovery rules,
cross-browser mock behavior, and keyboard shortcuts without leaving the active
tree. **About** records the Tabs Outliner lineage, build version, runtime, and
local-data privacy model. Both dialogs are shared by the extension and localhost
app, close with Escape or their Close action, and never mutate browser data.

**Open** accepts Browser Atlas JSON, URL text files, and original Tabs Outliner
`.tree` operation-log exports. Legacy windows, groups, nested tabs, notes,
separator styles, collapsed state, custom titles, favicons, and protected
Google Doc colors are converted into an editable portable document. The same
parser and document pane run in the extension and at the localhost route.

The extension watch build is written to `dist-extension`. Load that directory
as an unpacked extension from `chrome://extensions`.

The extension toolbar badge shows the current tab count and its tooltip includes
both window and tab counts. Clicking the toolbar action creates a dedicated
900×900 popup when no explorer exists, or focuses the existing Browser Atlas
tab/window. It then expands, scrolls to, and keyboard-selects the browser window
from which the action was invoked. **Pop out** creates the same standalone shell
from an already open explorer; at localhost it uses a normal same-origin popup
with the shared mock storage. The reveal flow can be exercised without a real
extension action with `/browser-atlas?focusWindowId=1002`.

## Isolated Chromium tests

```bash
pnpm --filter @app-game/browser-atlas test:e2e:install
pnpm --filter @app-game/browser-atlas test:e2e
pnpm --filter @app-game/browser-atlas test:e2e:web
pnpm --filter @app-game/browser-atlas test:e2e:video
```

The Playwright suite loads `dist-extension` into bundled Chromium with a new
temporary profile. It creates only controlled local tabs and normal windows,
never reads or mutates a personal Chrome profile, and removes the temporary
profile after the test. Set `BROWSER_ATLAS_E2E_HEADED=1` or use `test:e2e:headed`
to watch the run. Use `test:e2e:video` to attach a `.webm` recording of the
extension page to the result under `test-results`.

Live tabs and windows expose a green **Close and Save** action. Browser Atlas
persists their URLs in extension-local storage before closing them, keeps them
under **Saved items**, and restores individual tabs or complete windows from
the same tree. This data is local to the Chromium profile running the extension.

**Save all** retains and closes every other browser window while keeping the
Browser Atlas window available. The extension also registers commands for
save-closing the current tab, current window, or every window; shortcuts can be
assigned at `chrome://extensions/shortcuts`. As in the original Tabs Outliner,
windows just retained by Save All are highlighted light green until the browser
exits. Newly crash-recovered windows use the same session-only emphasis.

The MV3 background worker continuously checkpoints restorable live tabs. After
an unclean browser or computer shutdown, checkpoint tabs missing from both the
live session and deliberately saved data are retained as **Recovered** windows.
Current and already-saved URLs are consumed as a multiset to avoid duplicate
recovery records.

The Explore toolbar can create persistent groups, notes, three-style
separators, a protected Google document, or open a new browser window. Select any saved node before creating
an item to nest it there; otherwise it is added to the Saved items root. Edit
groups and notes with the pencil action or F2. Activating a group by Space or
double-click opens it as a real browser window; dropping a live tab into a
group performs the same conversion while retaining its title and descendants.
Activating a separator cycles its style. As in Tabs Outliner, the **Window**, **Group**,
**Note**, and **Rule** tools are also draggable: drop one inside a row or
above/below it for precise placement without changing the current selection.
Dragging **Window** creates a real live Chromium window whose persistent shadow
starts at that tree position; localhost creates the equivalent mock window and
initial tab. Drag creation uses the same persistent command path in both runtimes.
Dragging any link or hierarchy out of Browser Atlas now publishes native
`text/uri-list`, readable plain text, semantic HTML, JSON, and a downloadable
Browser Atlas document. This lets a link open when dropped on a browser tab strip
or address bar while text editors and rich-text applications receive useful
content instead of an internal JSON envelope. Dropping browser links, selected
text, or HTML into Atlas creates retained links or notes; HTML produced by Atlas
also carries a non-executable envelope that preserves the complete nested
hierarchy between windows even when custom MIME types are stripped. The localhost
mock exercises the same native `DataTransfer` formats and persistence path.
The red × deletes any saved hierarchy; up to 50 deleted hierarchies are retained
locally. Session Undo/Redo is powered by `createUndoHistory`: **Undo** restores the
latest tree edit and **Redo** repeats the latest undone edit. **Deleted** opens the complete persistent
newest-first history with each title, kind, deletion time, recursive node count,
and collapse-sensitive deletion mode. Any selected hierarchy can be restored
to its original parent and position while the other recovery entries remain.
Undo of an Atlas Delete or Save & Close operation recreates the real Chromium
tabs and windows, then rebinds their new browser IDs to the durable tree nodes.
The same history is stored in `chrome.storage.local` and the localhost mock's
`localStorage`. The draggable **Doc** fabric
matches the original Google Doc tool: it inserts `Untitled document` exactly
where dropped, opens `https://docs.google.com/document/create`, and retains the
tree node after a natural tab close. The localhost mock models the same live-to-
saved lifecycle without contacting Google.

Every open Chromium window and tab has a durable live shadow containing its
current hierarchy, title, URL, active/pinned state, and browser binding. Closing
a complete Chromium window naturally converts that shadow into a saved window
with the full hierarchy, even when it has no annotations. A direct note or other
retained child protects an individual live tab from disappearing on a natural
tab close; the Doc fabric also carries an explicit keep-on-close mark and uses a
blue title before and after closing. The keep-on-close mark round-trips through
Browser Atlas JSON, clipboard, and drag-copy imports.

F2 on a live or saved window edits its persistent custom title. The title
survives reloads, Save & Close, and later restoration; the same command is
available as **Edit window title** in the row context menu. Chromium stores the
title in the live window's persistent shadow, while the localhost mock exercises
the identical lifecycle without browser APIs. A custom title also marks the
window as intentional context, so closing it through Chromium keeps the titled
window and all of its tabs in the tree even when it has no notes or other
retained children. The same atomic preservation applies when the live window is
nested or contains an organizer; browser tab-removal events are deferred to the
window-close handler so unmarked tabs are not lost before the session is saved.

Browser Atlas also retains the last known position and size of persistent
windows. Save & Close captures fresh bounds, Chromium move/resize events update
live shadows, and restoring a saved window first normalizes it and then reapplies
those bounds. **Settings** can disable original-bounds restoration. The localhost
mock persists deterministic window bounds and models both setting states, so the
workflow is testable without moving a real desktop window.

Delete follows the original collapse-sensitive rule. Deleting an expanded
persistent node removes only that node and promotes its direct children at the
same position; deleting a collapsed node removes the complete hidden subtree.
The context menu labels the operation explicitly. `createUndoHistory` restores exact
tree-and-deletion-history snapshots instead of duplicating promoted children. The
separate Deleted archive survives reloads; the in-memory Undo/Redo timeline starts
fresh with each explorer session. Cut remains intentionally subtree-based because clipboard operations
always act on complete hierarchies.

Save & Close follows the same original collapsed-branch convention. On an
expanded tab or window it saves and closes only that browser item, leaving live
items nested from other browser windows untouched. Collapse the row first and
Backspace or **Save & Close hierarchy** saves and closes every hidden live tab
and window beneath it. Chromium and both localhost browser mocks share this
behavior.

**Expand all** opens every collapsed branch in the current pane; **Undo expand**
restores exactly the branches that were collapsed before that operation.
Collapsed branches retain the original recursive statistics block. The first
value counts every hidden node, `▣` counts hidden live browser windows, and `●`
counts hidden live tabs; redundant and zero values are omitted. Clicking the
statistics block expands the branch, just like clicking its tree anchor. The
calculation uses the normalized tree, so Chromium and the localhost mock report
the same hierarchy semantics.

Browser Atlas retains up to 30 local Persistent Tree snapshots. A recovery point
is created automatically before a changed tree is written when at least five
minutes have elapsed since the previous snapshot. **Backup** captures the current
tree immediately, and **Restore backup** consumes and restores the newest local
snapshot. **Backups** opens the complete newest-first history with each timestamp
and recursive node count. **Open** loads a recovery point as a detached tree for
selective drag-and-drop recovery, while **Restore** replaces the live tree and
consumes only that selected entry. Chromium stores these snapshots in extension-local storage; the
localhost mock uses `localStorage`, so the same recovery flow can be tested at
`http://localhost:3120/browser-atlas`.

The **Cloud** panel provides the original remote-backup workflow through a
backend-neutral provider: connect or disconnect, add a machine label, enable
24-hour automatic copies, create a manual copy, list the newest 30 backups,
open any copy as a detached editable tree, restore without consuming a remote
copy, and permanently delete individual copies. Opening a copy leaves the live
tree untouched, so selected branches can be dragged from it into another pane;
full restore first creates a local safety snapshot of the current tree.
At localhost, Chrome (mock) and Firefox (mock) have completely independent
connections, preferences, and durable cloud objects stored under separate
`localStorage` keys. Ctrl/Cmd+B creates a cloud backup when the selected backend
has a connected provider, opens its connection panel when disconnected, and
falls back to a local snapshot when cloud support is unavailable.

As in Tabs Outliner, a compact strip beside **Cloud** reports the latest upload
attempt: gray means no attempt in this browser session, green means success,
and red means failure. The panel repeats the status in accessible text with the
manual/automatic mode, time, and provider error when present. Chromium retains
it in `chrome.storage.session`, so an MV3 service-worker restart does not erase
it; localhost uses independent Chrome/Firefox `sessionStorage` keys. A new
browser session resets the indicator to gray without deleting backup history.

The Chromium extension stores remote copies in Google Drive's private
`appDataFolder`; they are visible only to Browser Atlas and do not pass through
an application server. To enable it for a distributable build, enable the Google
Drive API, create a Chrome-extension OAuth client for the extension ID, and set
its client ID while building:

```sh
BROWSER_ATLAS_GOOGLE_OAUTH_CLIENT_ID=123-example.apps.googleusercontent.com \
  pnpm --filter @app-game/browser-atlas build:extension
```

The build injects only the `drive.appdata` scope into the generated manifest.
Without this variable, the Cloud panel explains that Google Drive is unavailable
and local snapshots continue to work. When enabled, an hourly extension alarm
checks whether the newest automatic copy is at least 24 hours old.

The shared tree supports keyboard navigation with the arrow keys, Home, End,
Page Up, Page Down, Space, and F2. Page keys move ten visible rows, while Home
and End select the first or last sibling. Original workflow shortcuts are also
available while a tree row has focus: Backspace or Alt+Delete saves and closes a live node,
Delete immediately removes a live or saved persistent node, Ctrl/Cmd+Z restores the latest deletion,
Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y repeats it, and Q runs
Save All, Ctrl/Cmd+B creates a cloud backup when available, W scrolls upward to the previous
visible live window, S restores earlier stable tree scroll positions, and
`+`/`-` toggles a branch. The **Prev window** and **Undo scroll** toolbar actions
provide the same navigation without shortcuts, while **Current** reveals and
focuses the browser's active window.

The Chromium extension also registers Browser Atlas itself as an assignable
global shortcut, alongside Save & Close Current Tab, Current Window, and All
Windows. These browser-level shortcuts can be assigned under
`chrome://extensions/shortcuts`.

The primary Explore pane follows browser-window focus changes automatically,
including focus changes initiated from the opposite pane. Activating an item in
the primary pane suppresses the redundant auto-scroll, matching the original
Tabs Outliner behavior. **Settings** can disable following, opt into one-click
tab/window activation (double click is the default), and request that the
extension open Browser Atlas on Chromium startup. Its Appearance section also
recreates the original experimental light background and independent color
overrides for saved, open, active tabs, and notes. The original default colors
remain visible when an override is disabled, protected Google Docs keep their
custom blue title, and changes apply immediately to both panes. Settings use
`chrome.storage.local` in the extension and `localStorage` in the localhost
mock, and persist across reloads in both runtimes.

The original **Tree Style Tabs** relationship is also preserved. When Chromium
reports an `openerTabId`, Browser Atlas nests the new live tab beneath its
opener instead of flattening it into the window. The relationship survives
reloads and browser events because the complete live hierarchy is continuously
stored, and it keeps attached notes or organizers with the live tab. **Settings**
can disable this behavior. On localhost, Ctrl/Cmd-clicking or middle-clicking a
saved link creates the same nested mock-tab chain, so both the enabled and
disabled behaviors can be exercised without touching a real profile.

`C` clones the current view into the opposite explorer pane. The destination
switches to the same browser/file backend and Explore/Bookmarks/History source,
then receives the exact collapsed-branch set and scroll position. This adapts
Tabs Outliner's separate cloned windows to Browser Atlas's side-by-side model,
where both views remain independently scrollable and can exchange complete
hierarchies by drag-and-drop. The directional **Clone** toolbar buttons and the
Global context-menu action provide the same behavior in Chromium and localhost.

Dragging a live tab onto the Explore root detaches it into a new browser window.
Its persistent identity and nested organizer context move with it, including
notes and separators, and the localhost mock models the same new-window flow.
Holding Alt, Ctrl, or Cmd changes the gesture to a copy: no browser tab is moved,
and a saved copy of the complete hierarchy is added at the persistent root.

At `http://localhost:3120/browser-atlas`, the backend selector exposes
independently persisted **Chrome (mock)** and **Firefox (mock)** identities.
Dragging a live tab or window between them imports at the destination first and
removes the source only after that import succeeds. A destination failure never
touches the source; a later cleanup failure deliberately leaves a safe
duplicate. Holding Alt, Ctrl, or Cmd requests a copy instead. File backends stay
copy-only, so dropping into an export document cannot unexpectedly close a live
browser tab.

Space activates a live tab or restores a saved tab/window/group. Alt+Space and
Alt+double-click perform the original **Alt Restore** on a saved window: only
tabs that belonged to that window's latest saved session are reopened, while
older saved tabs nested in the same hierarchy remain saved. Persistent tab and
window bindings carry an explicit session identity, so this behavior is
deterministic in Chromium and the localhost mock rather than inferred from
timestamps.

Shift-clicking any explorer link opens a duplicate in a new browser window.
Ctrl/Cmd-click and middle-click open it in the last focused normal window.
These commands never restore, rebind, or remove the source saved tab, and the
same **Open link in new window** / **Open link in last window** actions are
available under Utilities in the row context menu. The localhost mock models
the created windows, focused state, active tab, and repeated target-window use.

The original organizer insertion map is supported in the mutable Explore tree:
Enter adds a note below, Shift+Enter adds one above, Alt/Ctrl/Cmd+Enter adds one
at the end of the tree, and adding Shift wraps the selected item in a new note.
Insert adds a last child, Alt/Ctrl/Cmd+Insert adds a first child, and Shift+Insert
wraps the selected item. Shift+G inserts a group above, while L inserts a
separator below. Every placement works with live tabs/windows as well as saved
nodes and is implemented by the localhost mock.

F2 on a live or saved tab creates its inline context note as the first child;
pressing F2 again edits that note. Note input also retains the original quick
conversion syntax: a title beginning with `2G ` creates a group, while three or
more repeated `-`, `=`, or `.` characters create the corresponding separator
style. These conversions are persisted identically by Chromium and the
localhost mock.

Structural keyboard moves follow the original tree workflow. Tab or
Ctrl/Cmd+Right indents a hierarchy beneath its previous sibling; Shift+Tab or
Ctrl/Cmd+Left moves it one level out. Ctrl/Cmd+Up and Ctrl/Cmd+Down move through
adjacent hierarchy positions, including crossing a parent boundary, while
Ctrl/Cmd+Home and Ctrl/Cmd+End move to the first or last position under the
current parent. Complete descendants move together. For a live tab this changes
its persistent organizational position without closing or duplicating the
underlying browser tab, in both Chromium and the localhost mock. E finds the
nearest containing live/saved window or saved group and moves that complete
organizer to the end of the tree, matching the original utility command.
The `/` utility flattens nested tabs under the selected persistent node while
keeping saved windows and groups as hierarchy boundaries. When the selected
row is collapsed, nested window/group organizers are flattened as well, just
as in Tabs Outliner.

Ctrl/Cmd+F opens an in-pane search that matches titles, URLs, and descriptions
across all currently visible tree nodes; Enter and Shift+Enter move between
matches without taking keyboard focus away from the query. Ctrl/Cmd+P prints
the complete visible tree, and Ctrl/Cmd+S exports those same rows as a
standalone printable HTML file. Both commands serialize the headless tree model,
so rows outside the virtualized viewport are included while descendants of
collapsed branches are intentionally omitted. The same actions are available
under **Global** in the row context menu and work in Chromium and the localhost
mock. HTML exports also embed a validated Portable Tree v2 document as inert
JSON. Opening the `.html` file loads that visible hierarchy as an editable
document, while dropping its HTML into a compatible tree row imports the same
groups, windows, links, notes, separators, collapsed flags, and nesting instead
of flattening it into a list of anchors. Embedded text is escaped so it cannot
terminate the inert script-data block or execute as markup.

Native Ctrl/Cmd+C, Ctrl/Cmd+X, and Ctrl/Cmd+V operate on the selected tree row.
Copy preserves the complete nested hierarchy and also publishes readable plain
text, HTML, and URL-list representations for other applications. Paste appends
the hierarchy beneath the selected compatible node. Cut uses the same portable
clipboard data, then permanently closes a live tab/window or removes the saved,
bookmark, or editable-document source node; saved-tree cuts remain available to
Undo. These workflows use the same persistent implementation in the extension
and the localhost mock.

Right-clicking a tree row opens the equivalent contextual command menu. It
groups hierarchy copy/cut/paste, node actions, relative note/group/separator
creation, and every structural move that is valid at that position. The row is
selected before the menu opens, Escape dismisses it, and Shift+right-click
leaves the browser's native context menu available. The two explorer panes
share an in-app portable clipboard so complete hierarchies can be exercised on
localhost even when the browser denies direct clipboard access.

Saved tabs, windows, groups, notes, and separators all use Persistent Tree v2.
Every node kind can contain every other node kind, and drag-and-drop moves the
complete hierarchy without flattening it.

Hold Alt, Ctrl, or Cmd while dragging to copy instead of move. Same-backend
copies pass through the portable hierarchy importer, so every copied node gets
a fresh durable identity while nested windows, tabs, groups, notes, and
separators remain intact. This modifier behavior is supported by both Chromium
and the localhost mock; cross-backend drags remain copies regardless of the
modifier state.

Live tabs can be moved into saved organizers without closing or copying them.
Their persistent position survives reloads and stays fixed when Chromium moves
the underlying tab to another browser window. Dropping a saved tab, window, or
mixed hierarchy onto a live window restores its retained URLs into that window
while preserving groups, notes, separators, and already-live descendants.
Regular Restore actions also rebind nodes in place, so restoring a saved window
does not discard its organizational context.

Each pane can independently display the live browser/local backend, the left
editable file, or the right editable file. Drop a versioned Browser Atlas
JSON document or newline-oriented URL text file directly onto a pane to open it.
The pane toolbar can also open a file, export every collection as Browser Atlas
JSON, or export the selected collection as a newline-oriented URL list.
Drag a tree item onto another tree to move or copy it, or out to the desktop in
Chromium to save that item as portable JSON.

Portable drag-and-drop uses the versioned explorer payload together with
`application/json`, `text/uri-list`, and `text/plain` representations. Drops
within one backend retain native move behavior; drops between browsers or files
copy portable content so the source is not deleted before import succeeds.
Portable Tree v2 retains groups, links, notes, and all three separator styles.
Dropping selected plain text into the persistent tree creates a note, while a
dropped link or address creates a saved tab without flattening its descendants.

Annotations attached to a live tab follow that tab when Chromium moves it to a
different window, including moves initiated outside Browser Atlas. Closing the
moved tab through Chromium still retains the tab and its attached context.

## Architecture

The application is composed from four dependency layers:

- `src/tree-view` contains the generic virtual tree renderer and headless
  expansion model. `@app-game/solid-virtual` limits each recursive level to the
  viewport while preserving the connected tree markup. Keyboard/selection
  state, scroll restoration, native drag gestures, the selection indicator,
  and the drop indicator are independent opt-in modules; the base `TreeView`
  requires none of them.
- `src/explorer` contains tabs/bookmarks/history models, drop policy, commands,
  portable JSON/text/clipboard codecs, and Solid resource orchestration. It has no
  browser-extension API calls.
- `src/backends` implements the explorer backend contract. Chrome API usage is
  confined to `backends/chrome`; the shared website uses the interactive mock
  browser in `backends/mock`, and editable files use `backends/document`.
- `src/App.tsx` is the composition root that injects a backend and opts into the
  interaction and visual layers needed by Browser Atlas.

Future Firefox, import/export, IndexedDB, or synchronized-server support should
implement `ExplorerBackend` without changing the TreeView or explorer policy.
