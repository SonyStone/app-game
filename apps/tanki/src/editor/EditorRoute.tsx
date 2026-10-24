import { makeEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { createEmptyMap, parseMap, PIXELS_PER_METER, serializeMap, type MapPoint, type TankiMap } from '../map/format';
import { downloadMap, readMapFile } from '../map/storage';
import { createMapDocument } from './createMapDocument';
import { createMapView } from './createMapView';
import {
  deleteItems,
  duplicateItems,
  findItem,
  moveItems,
  placeKingOfTheHill,
  removeVertex,
  type VertexRef
} from './edits';
import { ImportDialog } from './ImportDialog';
import { LibraryDialog } from './LibraryDialog';
import { isTyping, MapCanvas, type ShapeKind } from './MapCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import { TOOLS, type Tool } from './tools';
import { Button } from './ui';

/**
 * The Tanki map editor: import a piece of OpenStreetMap, reshape it into a level, mark the red
 * and blue spawn zones and the capture point, and save it as a Tanki map (`../map/format.ts`)
 * to a file or to this browser. The map being edited survives reloads.
 */
export default function EditorRoute() {
  const initial = loadWorkingCopy();
  const doc = createMapDocument(initial);
  const view = createMapView();
  const [tool, setTool] = createSignal<Tool>('select');
  const [shapeKind, setShapeKind] = createSignal<ShapeKind>('building');
  const [chosen, setChosen] = createSignal<string[]>([]);
  const [vertex, setVertex] = createSignal<VertexRef>();
  const [pointer, setPointer] = createSignal<MapPoint>();
  const [dialog, setDialog] = createSignal<'import' | 'library'>();
  const [notice, setNotice] = createSignal<{ text: string; error: boolean }>();
  const selection = createMemo(() => chosen().filter((id) => findItem(doc.map(), id)));
  const hint = createMemo(() => TOOLS.find((candidate) => candidate.id === tool())?.hint ?? '');
  let fileInput!: HTMLInputElement;

  view.fit(initial.bounds);

  createEffect(
    () => doc.committed(),
    (map) => {
      const timer = setTimeout(() => saveWorkingCopy(map), AUTOSAVE_DELAY_MS);

      return () => clearTimeout(timer);
    }
  );

  createEffect(
    () => notice(),
    (current) => {
      if (!current) {
        return;
      }

      const timer = setTimeout(() => setNotice(undefined), current.error ? 8000 : 3000);

      return () => clearTimeout(timer);
    }
  );

  makeEventListener(window, 'keydown', shortcut);

  return (
    <div class="fixed inset-0 flex flex-col bg-[#1b1b1b] font-sans text-[#e6e6e6] select-none">
      <header class="flex h-11 shrink-0 items-center gap-2 border-0 border-b border-solid border-[#333] bg-[#202020] px-3">
        <span class="mr-1 text-[13px] font-semibold tracking-wide">
          Tanki <span class="font-normal text-[#8a8a8a]">map editor</span>
        </span>
        <span
          class="max-w-56 truncate rounded bg-[#2a2a2a] px-2 py-1 text-xs text-[#cfcfcf]"
          title="Map name, editable in the panel on the right"
        >
          {doc.map().name}
        </span>
        <div class="mx-1 h-5 w-px bg-[#383838]" />
        <Button onClick={newMap} title="Start an empty 400 m map">
          New
        </Button>
        <Button tone="accent" onClick={() => setDialog('import')} title="Import a piece of OpenStreetMap">
          Import OSM…
        </Button>
        <Button onClick={() => fileInput.click()} title="Open a .tanki-map.json file (Ctrl+O)">
          Open file…
        </Button>
        <Button
          onClick={() => downloadMap(doc.committed())}
          title="Download the map as a .tanki-map.json file (Ctrl+S)"
        >
          Save file
        </Button>
        <Button onClick={() => setDialog('library')} title="Save to or open from this browser's storage">
          Browser…
        </Button>
        <div class="mx-1 h-5 w-px bg-[#383838]" />
        <Button onClick={doc.undo} disabled={!doc.canUndo()} title="Undo (Ctrl+Z)">
          Undo
        </Button>
        <Button onClick={doc.redo} disabled={!doc.canRedo()} title="Redo (Ctrl+Shift+Z)">
          Redo
        </Button>
        <div class="ml-auto flex items-center gap-1">
          <Button onClick={() => view.zoomBy(1 / 1.25)} title="Zoom out (−)">
            −
          </Button>
          <span class="w-12 text-center text-xs text-[#cfcfcf] tabular-nums">{view.percent()}%</span>
          <Button onClick={() => view.zoomBy(1.25)} title="Zoom in (+)">
            +
          </Button>
          <Button onClick={() => view.fit(doc.map().bounds)} title="Show the whole map (F)">
            Fit
          </Button>
        </div>
      </header>
      <div class="flex min-h-0 flex-1">
        <Toolbar tool={tool()} onTool={setTool} shapeKind={shapeKind()} onShapeKind={setShapeKind} />
        <main class="relative min-w-0 flex-1">
          <MapCanvas
            document={doc}
            view={view}
            tool={tool()}
            shapeKind={shapeKind()}
            selection={selection()}
            onSelect={setChosen}
            onCreated={() => setTool('select')}
            vertex={vertex()}
            onVertex={setVertex}
            onPointerWorld={setPointer}
          />
          <Show when={doc.map().objects.length === 0 && !dialog()}>
            <div class="pointer-events-none absolute inset-0 grid place-items-center">
              <div class="pointer-events-auto flex w-80 flex-col items-center gap-3 rounded-xl border border-solid border-[#3d3d3d] bg-[#232323]/95 p-5 text-center shadow-2xl">
                <h2 class="m-0 text-sm font-semibold">An empty map</h2>
                <p class="m-0 text-xs leading-relaxed text-[#a8a8a8]">
                  Start from a piece of Moscow from OpenStreetMap, open a saved map, or draw your own with the tools on
                  the left.
                </p>
                <div class="flex gap-2">
                  <Button tone="accent" onClick={() => setDialog('import')}>
                    Import OSM…
                  </Button>
                  <Button onClick={() => fileInput.click()}>Open file…</Button>
                </div>
              </div>
            </div>
          </Show>
          <Show when={notice()}>
            {(current) => (
              <div
                role="status"
                class={[
                  'absolute top-3 left-1/2 max-w-[70%] -translate-x-1/2 rounded-lg border border-solid px-3 py-2 text-xs shadow-xl',
                  current().error
                    ? 'border-[#5a2b2b] bg-[#3a2323] text-[#ffb4b4]'
                    : 'border-[#3d3d3d] bg-[#262626] text-[#e6e6e6]'
                ]}
              >
                {current().text}
              </div>
            )}
          </Show>
          <Show when={dialog() === 'import'}>
            <ImportDialog
              onImport={(map) => replaceMap(placeKingOfTheHill(map), `Imported ${map.objects.length} objects.`)}
              onClose={() => setDialog(undefined)}
            />
          </Show>
          <Show when={dialog() === 'library'}>
            <LibraryDialog
              map={doc.committed()}
              onOpen={(map) => replaceMap(map, `Opened "${map.name}".`)}
              onClose={() => setDialog(undefined)}
            />
          </Show>
        </main>
        <PropertiesPanel
          map={doc.map()}
          selection={selection()}
          vertex={vertex()}
          onChange={doc.commit}
          onDelete={deleteSelection}
          onDuplicate={duplicateSelection}
          onDeleteVertex={deleteVertex}
          onLayoutKingOfTheHill={() => doc.commit(placeKingOfTheHill(doc.committed()))}
        />
      </div>
      <footer class="flex h-7 shrink-0 items-center gap-3 border-0 border-t border-solid border-[#333] bg-[#202020] px-3 text-[11px] text-[#9a9a9a]">
        <span class="min-w-0 flex-1 truncate">{hint()}</span>
        <Show when={pointer()}>
          {(point) => (
            <span class="tabular-nums">
              {(point().x / PIXELS_PER_METER).toFixed(1)}, {(point().y / PIXELS_PER_METER).toFixed(1)} m ·{' '}
              {Math.round(point().x)}, {Math.round(point().y)} px
            </span>
          )}
        </Show>
        <Show when={doc.map().source}>{(source) => <span>{source().attribution}</span>}</Show>
      </footer>
      <input
        ref={(element) => (fileInput = element)}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';

          if (!file) {
            return;
          }

          const result = await readMapFile(file);

          if (result.ok) {
            replaceMap(result.map, `Opened ${file.name}.`);
          } else {
            setNotice({ text: `${file.name}: ${result.error}`, error: true });
          }
        }}
      />
    </div>
  );

  /** Puts `map` in the editor as one undo step, frames it and closes dialogs. */
  function replaceMap(map: TankiMap, message: string) {
    doc.commit(map);
    setChosen([]);
    setVertex(undefined);
    setDialog(undefined);
    view.fit(map.bounds);
    setNotice({ text: message, error: false });
  }

  function newMap() {
    replaceMap(
      createEmptyMap('Untitled map', NEW_MAP_SIZE, NEW_MAP_SIZE),
      'New empty map. Undo brings the old one back.'
    );
  }

  function deleteSelection() {
    if (selection().length > 0) {
      doc.commit(deleteItems(doc.committed(), selection()));
      setVertex(undefined);
    }
  }

  function duplicateSelection() {
    const copy = duplicateItems(doc.committed(), selection(), { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET });
    doc.commit(copy.map);
    setChosen(copy.ids);
  }

  function deleteVertex() {
    const current = vertex();

    if (current) {
      doc.commit(removeVertex(doc.committed(), current));
      setVertex(undefined);
    }
  }

  /** The editor's keyboard shortcuts; keys typed into fields and dialogs are left alone. */
  function shortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || isTyping(event) || dialog()) {
      return;
    }

    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (command) {
      const actions: Record<string, () => void> = {
        z: () => (event.shiftKey ? doc.redo() : doc.undo()),
        y: () => doc.redo(),
        d: duplicateSelection,
        a: () =>
          setChosen([...doc.map().objects, ...doc.map().spawns, ...doc.map().capturePoints].map((item) => item.id)),
        s: () => downloadMap(doc.committed()),
        o: () => fileInput.click()
      };

      if (actions[key]) {
        event.preventDefault();
        actions[key]();
      }

      return;
    }

    if (event.altKey) {
      return;
    }

    const nudge = event.shiftKey ? 10 : 1;
    const arrows: Record<string, MapPoint> = {
      arrowleft: { x: -nudge, y: 0 },
      arrowright: { x: nudge, y: 0 },
      arrowup: { x: 0, y: -nudge },
      arrowdown: { x: 0, y: nudge }
    };

    if (arrows[key] && selection().length > 0) {
      event.preventDefault();
      doc.commit(moveItems(doc.committed(), selection(), arrows[key]));
      return;
    }

    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();

      if (vertex()) {
        deleteVertex();
      } else {
        deleteSelection();
      }

      return;
    }

    if (key === 'escape') {
      setChosen([]);
      setVertex(undefined);
      return;
    }

    if (key === 'f') {
      view.fit(doc.map().bounds);
      return;
    }

    if (key === '+' || key === '=') {
      view.zoomBy(1.25);
      return;
    }

    if (key === '-') {
      view.zoomBy(1 / 1.25);
      return;
    }

    const picked = TOOLS.find((candidate) => candidate.key.toLowerCase() === key);

    if (picked) {
      setTool(picked.id);
    }
  }
}

const WORKING_COPY_KEY = 'tanki-editor:working-copy';
const AUTOSAVE_DELAY_MS = 500;
const NEW_MAP_SIZE = 400 * PIXELS_PER_METER;
const DUPLICATE_OFFSET = 4 * PIXELS_PER_METER;

/** The map left in the editor last time, or an empty one. */
function loadWorkingCopy() {
  const text = localStorage.getItem(WORKING_COPY_KEY);
  const result = text ? parseMap(text) : undefined;

  return result?.ok ? result.map : createEmptyMap('Untitled map', NEW_MAP_SIZE, NEW_MAP_SIZE);
}

/** Keeps the map being edited across reloads; a full storage only loses that convenience. */
function saveWorkingCopy(map: TankiMap) {
  try {
    localStorage.setItem(WORKING_COPY_KEY, serializeMap(map));
  } catch {
    // The quota is full: saved maps still work, only the reload recovery is lost.
  }
}
