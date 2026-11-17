import { formValuesToBrush } from '@app-game/abr-brush/form';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import { NavigationPuck } from '@app-game/navigation-puck';
import type { Brush } from '@app-game/paint-core/brush';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, For, getOwner, isDisposed, onCleanup, Show, untrack } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { BrushLibraryPanel } from '../../features/brush';
import { BrushEditor, BrushStudio, snapshotBrushSettings } from '../../features/brush-editor';
import { abrCategoriesFor, abrValues } from '../../features/brush-editor/abrSchema';
import { BrushStrokePreview } from '../../features/brush-editor/BrushStrokePreview';
import { DrawingPad } from '../../features/brush-editor/DrawingPad';
import type { BrushLibrary } from '../../features/brush-library';
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
 * Its Cancel returns to the brush as it was when the studio opened, and closes it.
 *
 * Brushes, in the top bar, opens the app's preset list to switch between round, textured and ABR presets, whose
 * editors differ. ABR brushes are imported there through the ABR viewer; Paint has no importer that makes textured
 * presets, so the demo adds a generated one to its own library.
 *
 * The navigation puck, opened by a pen's side button or a stray button state while the pen hovers, covers the window
 * with a layer that closes it on the next press. The panel, the studio and the controls over the drawing lie above
 * that layer, and a press on them closes the puck and still reaches the control under it.
 */
export function BrushEditorDemo(props: PaintVariantProps) {
  const session = createPaintSession({ storageName: 'paint-demo-brush-editor' });
  const { camera, engine, ready, tools, brush, library, uploads, presets, mixer, colorPicker, pressureCalibration } =
    session;
  createDemoStart(session, {});
  void addTexturedSample(library);
  session.createShortcuts({ closePanel: () => false });
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
  const [studioOpen, setStudioOpen] = createSignal(false);
  // What the studio's Cancel returns to: the brush when the studio opens and whenever another preset is chosen.
  const studioBaseline = createMemo(() => {
    studioOpen();
    preset();
    return snapshotBrushSettings(untrack(brush), true);
  });
  const source = createMemo(() => library.find(preset())?.abrSource);
  const [abrReady, setAbrReady] = createSignal(false);
  const categories = createMemo(() => (source() && abrReady() ? abrCategoriesFor(source()!) : undefined));
  const [edited, setEdited] = createSignal(() => brush());
  const [editError, setEditError] = createSignal('');
  const owner = getOwner()!;
  // Reloaded library presets have a descriptor before the lazily mounted ABR viewer initializes its parser.
  void initAbr()
    .then(() => {
      if (!isDisposed(owner)) {
        setAbrReady(true);
      }
    })
    .catch((error: unknown) => {
      if (!isDisposed(owner)) {
        setEditError(error instanceof Error ? error.message : String(error));
      }
    });
  let revision = 0;
  // The images of the latest ABR edit, which the preset's saved images lack.
  const [editedAbr, setEditedAbr] = createSignal<{ preset: string; resources: readonly BrushResource[] }>();
  onCleanup(() => {
    revision++;
  });
  /** Echo rows immediately; new masks must be resident before the next stroke uses their IDs. */
  async function updateEditor(patch: Partial<Brush>) {
    const id = preset();
    const source = library.find(id)?.abrSource;
    const next = { ...edited(), ...patch };
    const version = ++revision;
    setEditError('');
    if (!source || next.engine?.id !== 'abr' || !patch.engine) {
      tools.updateBrush(patch);
      return;
    }

    setEdited(next);
    try {
      const prepared = prepareAbrBrush(formValuesToBrush(source, abrValues(next)));
      const uploaded = await engine.putResources(prepared.resources);
      if (version !== revision || preset() !== id) {
        return;
      }

      if (uploaded.isErr()) {
        throw new Error(uploaded.error.message);
      }

      setEditedAbr({ preset: id, resources: prepared.resources });
      tools.updateBrush({
        ...patch,
        engine: prepared.engine,
        size: prepared.size,
        spacing: prepared.spacing,
        flow: prepared.flow ?? next.flow,
        opacity: prepared.opacity ?? next.opacity
      });
    } catch (error) {
      if (version === revision && preset() === id) {
        setEdited(brush());
        setEditError(error instanceof Error ? error.message : String(error));
      }
    }
  }
  /** The stroke preview of the panel and the studio, `height` CSS pixels high. */
  const strokePreview = (height: number) => (
    <BrushStrokePreview
      brush={brush()}
      background={previewPaper}
      height={height}
      resources={async () => {
        const preset = library.find(tools.preset());
        if (!preset) {
          return [];
        }

        const result = await library.resources(preset);
        if (result.isErr()) {
          throw result.error;
        }

        const edits = untrack(editedAbr);
        return edits?.preset === tools.preset() ? [...result.value, ...edits.resources] : result.value;
      }}
    />
  );
  // The images the studio's pad needs: the chosen preset's, read while the studio is open, and the latest ABR edit's.
  const [presetImages, setPresetImages] = createSignal<{ preset: string; resources: readonly BrushResource[] }>();
  createEffect(
    () => (studioOpen() ? preset() : undefined),
    (id) => {
      const chosen = id === undefined ? undefined : library.find(id);
      if (!chosen) {
        return;
      }

      let current = true;
      void library.resources(chosen).then((result) => {
        if (!current) {
          return;
        }

        result.match(
          (resources) => setPresetImages({ preset: chosen.id, resources }),
          (error) => setEditError(error.message)
        );
      });
      return () => {
        current = false;
      };
    }
  );
  const padResources = createMemo(() => {
    const id = preset();
    const saved = presetImages();
    const edits = editedAbr();
    return [
      ...(saved?.preset === id ? saved.resources : []),
      ...(edits?.preset === id ? edits.resources : [])
    ];
  });
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
              brush={edited()}
              categories={brush().engine?.id === 'abr' ? categories() : undefined}
              baseline={baseline()}
              name={library.find(preset())?.name}
              onChange={(patch) => void updateEditor(patch)}
              onDone={() => setOpen(false)}
              preview={strokePreview(84)}
            />
          </div>
        </aside>
      </Show>
      <Show when={studioOpen()}>
        {/* An open dialog element keeps the editor's keyboard shortcuts from acting on the drawing behind it. */}
        <dialog ref={setStudio} open class={styles.studio}>
          <Show when={editError()}>{(message) => <p role="alert">{message()}</p>}</Show>
          <BrushStudio
            brush={edited()}
            categories={brush().engine?.id === 'abr' ? categories() : undefined}
            baseline={studioBaseline()}
            name={library.find(preset())?.name}
            onChange={(patch) => void updateEditor(patch)}
            onDone={() => setStudioOpen(false)}
            preview={strokePreview(96)}
            pad={
              <DrawingPad
                brush={pressureCalibration.strokeBrush(brush())}
                resources={padResources()}
                mapPressure={pressureCalibration.mapPressure}
              />
            }
          />
        </dialog>
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

/** The preview's paper: white, as a new drawing's, whatever the UI's colors. */
const previewPaper = '#ffffff';

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
