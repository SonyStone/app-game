import { NavigationPuck } from '@app-game/navigation-puck';
import { createSignal, For, Show } from 'solid-js';
import type { PaintVariantProps } from '..';
import { BrushEditor } from '../../features/brush-editor';
import { StrokePreview } from '../../features/brush-library/StrokePreview';
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
 * dragged at its edge or set to the editor's three layouts. Done folds the panel away; opening it again starts a new
 * edit, whose Cancel changes returns to the brush as it was then.
 */
export function BrushEditorDemo(props: PaintVariantProps) {
  const session = createPaintSession({ storageName: 'paint-demo-brush-editor' });
  const { camera, engine, ready, tools, brush, library } = session;
  createDemoStart(session, {});
  session.createShortcuts({ closePanel: () => false });
  const [open, setOpen] = createSignal(true);
  const [width, setWidth] = createSignal<number>(widths[0]!.width);
  const resize = pressHandlers({
    move: (press) => setWidth((current) => clampWidth(current - press.delta.x))
  });

  return (
    <PaintEditor session={session} class={styles.demo} style={{ '--panel-width': `${open() ? width() : 0}px` }}>
      <PaintStage session={session} class={styles.stage}>
        <StageGuides session={session} />
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div class={styles.ui}>
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
          <Show when={!open()}>
            <button class={styles.reopen} onClick={() => setOpen(true)}>
              <SketchIcon name="brush" size={18} />
              Edit brush
            </button>
          </Show>
        </div>
      </div>
      <Show when={open()}>
        <aside class={styles.panel} aria-label="Brush editor panel">
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
          <div class={styles.editor}>
            <BrushEditor
              brush={brush()}
              onChange={tools.updateBrush}
              onDone={() => setOpen(false)}
              preview={
                <StrokePreview
                  settings={brush()}
                  background={previewPaper}
                  height={84}
                  resources={async () => {
                    const preset = library.find(tools.preset());
                    if (!preset) {
                      return [];
                    }

                    const result = await library.resources(preset);
                    if (result.isErr()) {
                      throw result.error;
                    }

                    return result.value;
                  }}
                />
              }
            />
          </div>
        </aside>
      </Show>
    </PaintEditor>
  );
}

/** The preview's paper: white, as a new drawing's, whatever the UI's colours. */
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
