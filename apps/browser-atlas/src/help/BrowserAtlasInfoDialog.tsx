import type { JSX } from 'solid-js';
import { For, onCleanup, onMount } from 'solid-js';

/** Displays Browser Atlas workflows and shortcuts without leaving the current tree. */
export function BrowserAtlasHelpDialog(props: { onClose: () => void }) {
  return (
    <InfoDialogFrame title="Browser Atlas help" labelId="browser-atlas-help-title" onClose={props.onClose}>
      <section class="space-y-2">
        <h3 class="text-sm font-semibold text-neutral-100">Start here</h3>
        <p>
          Each pane can independently show open and retained tabs, bookmarks, history, or an opened tree file.
          Use the selector above a pane to choose a browser, then drag complete hierarchies between panes.
        </p>
        <ul class="list-disc space-y-1 pl-5">
          <li>Green actions save and close live tabs or windows; saved items restore in place.</li>
          <li>Window, Doc, Group, Note, and Rule can be clicked or dragged to choose an exact tree position.</li>
          <li>A Group is a saved future window: activate it, or drop a live tab inside it, to create that window.</li>
          <li>Double-click activates by default. Settings can switch to single-click activation.</li>
          <li>Right-click a row for clipboard, organizer, structural, recovery, and export commands.</li>
        </ul>
      </section>

      <HelpDetails title="Organize and move">
        <p>
          Every persistent node may contain descendants. Drop in the middle of a row to nest; drop near its top or
          bottom edge to insert before or after it. Holding Alt, Ctrl, or Cmd copies instead of moving.
        </p>
        <p>
          At localhost, Chrome (mock) and Firefox (mock) are independent durable browser simulations. A normal drag
          between them moves only after the destination acknowledges the import, while a modifier drag keeps a copy
          in both browsers.
        </p>
      </HelpDetails>

      <HelpDetails title="Save, restore, and recover">
        <ul class="list-disc space-y-1 pl-5">
          <li>
            Save & Close retains the URL and tree context. On an expanded row it closes only that browser item; on a
            collapsed row it also saves and closes every hidden live tab and window below it.
          </li>
          <li>
            Closing a Chromium window normally also keeps the complete window hierarchy as a saved window. Live
            titles, URLs, active state, and opener nesting update continuously without rebuilding unchanged rows.
          </li>
          <li>Alt-restore on a saved window opens only the tabs from its latest saved session.</li>
          <li>
            Light-green saved windows were just retained by Save All or recovered after a crash. The emphasis lasts
            only for the current browser session.
          </li>
          <li>
            Backup creates a local tree snapshot. Backups can open a detached recovery tree for selective branch
            transfer, or restore any retained recovery point in full.
          </li>
          <li>
            Cloud connects the selected browser identity, labels manual or daily copies, and can open, restore, or
            delete any of its latest 30 remote backups. Open loads a detached tree, so selected branches can be
            dragged into a live browser pane without replacing everything. Localhost keeps Chrome and Firefox mock
            clouds separate. The strip beside Cloud and the status row show no attempt, success, or failure for the
            current browser session.
          </li>
          <li>Tree edits are immediate: session Undo/Redo covers moves, organizer edits, and deletions; Deleted survives reloads.</li>
          <li>After an unclean Chromium shutdown, missing checkpoint tabs appear under Recovered windows.</li>
        </ul>
      </HelpDetails>

      <HelpDetails title="Keyboard shortcuts">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr class="border-b border-neutral-700 text-neutral-300">
                <th class="py-1 pr-4 font-medium">Key</th>
                <th class="py-1 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              <For each={HELP_SHORTCUTS}>
                {(shortcut) => (
                  <tr class="border-b border-neutral-800 last:border-0">
                    <td class="whitespace-nowrap py-1 pr-4 align-top">
                      <kbd class="rounded border border-neutral-600 bg-neutral-950 px-1.5 py-0.5 font-mono text-neutral-200">
                        {shortcut.keys}
                      </kbd>
                    </td>
                    <td class="py-1">{shortcut.action}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </HelpDetails>

      <HelpDetails title="Useful interaction details">
        <ul class="list-disc space-y-1 pl-5">
          <li>The extension button opens or focuses a standalone Browser Atlas window and reveals the browser window you invoked it from.</li>
          <li>Pop out opens another standalone view; localhost views share the same durable mock browser data.</li>
          <li>Collapsing a branch changes Delete from “promote children” to “remove the complete hidden subtree”.</li>
          <li>
            Drag links or hierarchies to browser and desktop targets; drop external links, selected text, or HTML back
            into the tree. A Browser Atlas HTML export retains its visible hierarchy when opened or dropped back.
          </li>
          <li>Shift-click opens a saved link in a new window without consuming it.</li>
          <li>Ctrl/Cmd-click or middle-click opens a saved link in the last focused window.</li>
          <li>Tree Style Tabs nests a newly opened tab beneath the live tab that opened it.</li>
          <li>Search and structural HTML export include every visible row, including rows outside the virtualized viewport.</li>
        </ul>
      </HelpDetails>
    </InfoDialogFrame>
  );
}

/** Displays project identity, provenance, and the current privacy model. */
export function BrowserAtlasAboutDialog(props: { onClose: () => void }) {
  return (
    <InfoDialogFrame title="About Browser Atlas" labelId="browser-atlas-about-title" onClose={props.onClose}>
      <section class="space-y-3">
        <div>
          <h3 class="text-lg font-semibold text-neutral-100">Browser Atlas</h3>
          <p class="text-neutral-400">{readBrowserAtlasVersion()}</p>
        </div>
        <p>
          A SolidJS rewrite and continuation of Tabs Outliner, built around a persistent, portable tree and
          side-by-side browser workspaces.
        </p>
        <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
          <dt class="font-medium text-neutral-300">Original project</dt>
          <dd>Tabs Outliner by Vladyslav Volovyk, first publicly released in 2012.</dd>
          <dt class="font-medium text-neutral-300">Current runtime</dt>
          <dd>SolidJS, TypeScript, Chrome Manifest V3, and a browser-independent backend contract.</dd>
          <dt class="font-medium text-neutral-300">Privacy</dt>
          <dd>
            Browser trees, settings, deleted items, and local snapshots stay in the current browser profile. Opened
            files remain local unless you explicitly export or move their contents.
          </dd>
          <dt class="font-medium text-neutral-300">Local demo</dt>
          <dd>
            The localhost app uses persistent Chrome and Firefox mocks, so feature testing does not touch a personal
            browser profile.
          </dd>
        </dl>
      </section>
    </InfoDialogFrame>
  );
}

function InfoDialogFrame(props: {
  title: string;
  labelId: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  let closeButton: HTMLButtonElement | undefined;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  onMount(() => closeButton?.focus());

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 print:hidden"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <section
        class="max-h-[min(48rem,calc(100vh-2rem))] w-full max-w-3xl overflow-y-auto rounded border border-neutral-600 bg-neutral-900 text-xs text-neutral-300 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.labelId}
      >
        <header class="sticky top-0 flex items-center border-b border-neutral-700 bg-neutral-900 px-4 py-3">
          <h2 id={props.labelId} class="text-base font-semibold text-neutral-100">
            {props.title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            class="ml-auto rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            aria-label={`Close ${props.title}`}
            onClick={props.onClose}
          >
            Close
          </button>
        </header>
        <div class="space-y-4 p-4 leading-relaxed">{props.children}</div>
      </section>
    </div>
  );
}

function HelpDetails(props: { title: string; children: JSX.Element }) {
  return (
    <details class="rounded border border-neutral-700 bg-neutral-950/40 p-3">
      <summary class="cursor-pointer font-semibold text-neutral-100">{props.title}</summary>
      <div class="mt-3 space-y-2">{props.children}</div>
    </details>
  );
}

const HELP_SHORTCUTS = [
  { keys: 'Space', action: 'Activate a live item or restore a saved tab, window, or group.' },
  { keys: 'Alt+Space', action: 'Restore only the latest saved session of a retained window.' },
  { keys: 'Backspace', action: 'Save and close the item, or its complete hierarchy when collapsed.' },
  { keys: 'Delete', action: 'Delete using the branch’s expanded or collapsed semantics.' },
  { keys: 'Ctrl/Cmd+Z', action: 'Undo the latest persistent tree change.' },
  { keys: 'Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y', action: 'Redo the latest undone tree change.' },
  { keys: 'F2', action: 'Edit a title, group, note, or inline tab note.' },
  { keys: 'Tab / Shift+Tab', action: 'Indent beneath the previous sibling or move one level out.' },
  { keys: 'Ctrl/Cmd+↑/↓', action: 'Move the selected hierarchy through adjacent positions.' },
  { keys: 'Ctrl/Cmd+Home/End', action: 'Move to the first or last position under the current parent.' },
  { keys: 'Enter / Shift+Enter', action: 'Add a note below or above the selected item.' },
  { keys: 'Insert', action: 'Add a note as the last child; modifiers select other placements.' },
  { keys: 'Shift+G / L', action: 'Add a group above or a separator below.' },
  { keys: 'C', action: 'Clone the current pane view into the opposite pane.' },
  { keys: 'W / S', action: 'Find the previous live window or undo the latest stable scroll.' },
  { keys: 'Q', action: 'Save and close all other browser windows.' },
  { keys: 'Ctrl/Cmd+B', action: 'Create a cloud backup when available, otherwise a local snapshot.' },
  { keys: 'Ctrl/Cmd+F', action: 'Search visible tree rows.' },
  { keys: 'Ctrl/Cmd+P / S', action: 'Print or export the visible tree as HTML.' },
  { keys: '/', action: 'Flatten nested tabs without crossing protected organizer boundaries.' },
  { keys: 'E', action: 'Move the containing window or group to the end of the tree.' }
] as const satisfies readonly Readonly<{ keys: string; action: string }>[];

function readBrowserAtlasVersion(): string {
  const candidate: unknown = Reflect.get(globalThis, 'chrome');
  if (!isRecord(candidate) || !isRecord(candidate.runtime) || typeof candidate.runtime.getManifest !== 'function') {
    return 'Development web build';
  }
  try {
    const manifest: unknown = candidate.runtime.getManifest();
    return isRecord(manifest) && typeof manifest.version === 'string'
      ? `Version ${manifest.version}`
      : 'Development extension build';
  } catch {
    return 'Development extension build';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
