import { NavigationPuck } from '@app-game/navigation-puck';
import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, For, Show, untrack } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { BrushLibraryPanel } from '../../features/brush';
import { BrushEditor, snapshotBrushSettings } from '../../features/brush-editor';
import type { BrushLibrary } from '../../features/brush-library';
import { BrushStudioDialog, SessionStrokePreview } from '../../features/brush/BrushStudioDialog';
import { createBrushSettingsEditor } from '../../features/brush/createBrushSettingsEditor';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './BrushEditorDemo.module.css';
import { createDemoStart } from './createDemoStart';

/**
 * Demo of the brush editor: the drawing on the left and the editor in a panel on the right, wired to the session's
 * brush with the real stroke preview, so a setting can be changed and drawn with at once. The panel's width can be
 * dragged at its edge or set to the editor's three layouts. Done folds the panel away. Cancel changes returns to the
 * brush as it was when the panel was opened or, after that, when a preset was last chosen.
 *
 * Brush studio, in the top bar, opens the full-screen editor (`BrushStudio`) for the same brush over the whole demo,
 * with a drawing pad (`DrawingPad`) on a scratch document of its own, so the panel and the studio can be compared.
 * Its Cancel returns to the brush as it was when the studio opened, and closes it. The pin buttons of both keep their
 * pins in memory.
 *
 * Brushes, in the top bar, opens the app's preset list to switch between round, textured and ABR presets, whose
 * editors differ. ABR brushes are imported there through the ABR viewer; Paint has no importer that makes textured
 * presets, so the demo adds a generated one to its own library.
 *
 * The navigation puck, opened by a pen's side button or a stray button state while the pen hovers, covers the window
 * with a layer that closes it on the next press. The panel and the controls over the drawing lie above that layer, and
 * the studio is a modal dialog over everything; a press on any of them closes the puck and still reaches the control
 * under it.
 */
export function BrushEditorDemo(props: PaintVariantProps) {
  const session = createPaintSession({ storageName: 'paint-demo-brush-editor' });
  const { camera, engine, ready, tools, brush, library, uploads, presets, mixer, colorPicker } = session;
  createDemoStart(session, {});
  void addTexturedSample(library);
  const [studioOpen, setStudioOpen] = createSignal(false);
  // Escape and the Android back gesture close the studio, keeping its changes.
  session.createShortcuts({
    closePanel() {
      if (studioOpen()) {
        setStudioOpen(false);
        return true;
      }

      return false;
    }
  });
  const [open, setOpen] = createSignal(true);
  const [width, setWidth] = createSignal<number>(widths[0]!.width);
  const resize = pressHandlers({
    move: (press) => setWidth((current) => clampWidth(current - press.delta.x))
  });
  // The preset's id alone: the tool state it is read from changes with every edit, which must keep the baseline.
  const preset = createMemo(() => tools.preset());
  // What Cancel changes returns to: the brush when the panel opens and whenever another preset is chosen.
  const baseline = createMemo(() => {
    open();
    preset();
    return snapshotBrushSettings(untrack(brush), true);
  });
  const editor = createBrushSettingsEditor(session);
  const { edited, categories, editError, update: updateEditor } = editor;
  // The demo has no board; pins are kept in memory, so the pin buttons can be tried.
  const [pinned, setPinned] = createSignal<readonly string[]>([]);
  const pins = {
    pinned: (id: string) => pinned().includes(id),
    toggle: (id: string) => setPinned((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]))
  };
  const [brushesOpen, setBrushesOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [controls, setControls] = createSignal<HTMLElement>();
  const [panel, setPanel] = createSignal<HTMLElement>();
  const [studio, setStudio] = createSignal<HTMLElement>();
  createEventListener(
    () => [controls(), panel(), studio()].filter((element) => element !== undefined),
    'pointerdown',
    () => {
      if (camera.navigation.center()) {
        camera.navigation.close();
      }
    },
    { capture: true }
  );

  return (
    <PaintEditor session={session} class={styles.demo} style={{ '--panel-width': `${open() ? width() : 0}px` }}>
      <PaintStage session={session} class={styles.stage}>
        <StageGuides session={session} />
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div ref={setControls} class={styles.ui}>
        <SessionNotices session={session} />
        <div class={styles.bar}>
          <Show when={props.experimentsHref}>
            {(href) => (
              <a href={href()} aria-label="Back to experiments" title="Back to experiments">
                <SketchIcon name="home" size={18} />
              </a>
            )}
          </Show>
          <button aria-label="Undo" disabled={!engine.state().canUndo || !ready()} onClick={session.undo}>
            <SketchIcon name="undo" size={18} />
          </button>
          <button aria-label="Redo" disabled={!engine.state().canRedo || !ready()} onClick={session.redo}>
            <SketchIcon name="redo" size={18} />
          </button>
          <button
            class={styles.reopen}
            aria-expanded={brushesOpen() ? 'true' : 'false'}
            onClick={() => {
              if (!brushesOpen()) {
                void library.loadAll();
              }

              setBrushesOpen(!brushesOpen());
            }}
          >
            <SketchIcon name="book" size={18} />
            Brushes
          </button>
          <Show when={!open()}>
            <button class={styles.reopen} onClick={() => setOpen(true)}>
              <SketchIcon name="brush" size={18} />
              Edit brush
            </button>
          </Show>
          <button class={styles.reopen} onClick={() => setStudioOpen(true)}>
            <SketchIcon name="sliders" size={18} />
            Brush studio
          </button>
        </div>
        <Show when={brushesOpen()}>
          <div class={styles.brushes} role="region" aria-label="Brushes">
            <BrushLibraryPanel
              presets={library.presets()}
              preset={tools.preset()}
              changed={(id) => tools.changes(id) !== undefined}
              brush={brush()}
              disabled={!ready() || uploads.busy()}
              onChange={tools.updateBrush}
              onSelect={(id) => void session.choosePreset(id)}
              onReset={tools.resetPreset}
              onSave={tools.savePreset}
              onSaveAs={(name, groups) => void tools.savePresetAs(name, groups)}
              onRename={(id, name) => library.update(id, { name })}
              onDelete={tools.deletePreset}
              sharedSize={tools.sharedSize()}
              onSharedSizeChange={tools.setSharedSize}
              onOpenAbr={() => {
                setAbrMounted(true);
                setAbrOpen(true);
              }}
              eraser={
                tools.tool() === 'eraser'
                  ? { mode: tools.eraserMode(), canClear: tools.canClear(), onModeChange: tools.setEraserMode }
                  : undefined
              }
            />
          </div>
        </Show>
      </div>
      <Show when={open()}>
        <aside ref={setPanel} class={styles.panel} aria-label="Brush editor panel">
          <div
            class={styles.handle}
            role="separator"
            aria-orientation="vertical"
            aria-label="Panel width"
            {...resize}
          />
          <div class={styles.widths} role="group" aria-label="Panel width">
            <For each={widths}>
              {(preset) => (
                <button
                  aria-pressed={width() === preset.width ? 'true' : 'false'}
                  onClick={() => setWidth(preset.width)}
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>
          <Show when={editError()}>{(message) => <p role="alert">{message()}</p>}</Show>
          <div class={styles.editor}>
            <BrushEditor
              pins={pins}
              brush={edited()}
              categories={brush().engine?.id === 'abr' ? categories() : undefined}
              baseline={baseline()}
              name={library.find(preset())?.name}
              onChange={(patch) => void updateEditor(patch)}
              onDone={() => setOpen(false)}
              preview={<SessionStrokePreview session={session} editor={editor} height={84} />}
            />
          </div>
        </aside>
      </Show>
      <Show when={studioOpen()}>
        <BrushStudioDialog
          ref={setStudio}
          session={session}
          editor={editor}
          pins={pins}
          onClose={() => setStudioOpen(false)}
        />
      </Show>
      <Show when={abrMounted()}>
        <AbrViewerDialog
          open={abrOpen()}
          close={() => setAbrOpen(false)}
          mixing={brush().mixing}
          onMixingChange={(mixing) => tools.updateBrush({ mixing })}
          onUseBrush={(asset) => {
            mixer.cancelPick();
            colorPicker.cancel();
            return presets.useBrush(asset);
          }}
        />
      </Show>
    </PaintEditor>
  );
}

/** Panel widths that show the editor's wide, medium and narrow layouts. */
const widths = [
  { label: 'Wide', width: 640 },
  { label: 'Medium', width: 480 },
  { label: 'Narrow', width: 340 }
] as const;

/** Keeps a dragged panel width between the narrow layout and most of the window. */
function clampWidth(width: number) {
  return Math.round(Math.max(280, Math.min(window.innerWidth - 120, width)));
}

/**
 * Adds the textured sample preset to the demo's library unless an earlier visit added it: a grainy disc stamped
 * closely, which shows the textured tip's rows in the editor.
 */
async function addTexturedSample(library: BrushLibrary) {
  const source = 'demo:textured-grain';
  await library.loadAll();
  if (library.presets().some((preset) => preset.source === source)) {
    return;
  }

  const tip = grainTip(96);
  await library.importPreset(
    {
      name: 'Grain (textured sample)',
      source,
      settings: { tool: 'brush', size: 48, spacing: 0.15, engine: { id: 'textured', settings: { tipId: tip.id } } }
    },
    [tip]
  );
}

/** A `size`-pixel grayscale disc that fades towards its edge and is broken up by fixed noise. */
function grainTip(size: number) {
  const pixels = new Uint8Array(size * size);
  let seed = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const grain = seed / 2 ** 32;
      const coverage = Math.max(0, 1 - distance) ** 0.6 * (grain > 0.45 ? 1 : grain);
      pixels[y * size + x] = Math.round(coverage * 255);
    }
  }

  return { id: 'demo:grain-tip', width: size, height: size, format: 'r8unorm' as const, pixels };
}
