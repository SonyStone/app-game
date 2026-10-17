import { createEffect, createMemo, createSignal, Errored, Show } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  SessionWindows,
  StageGuides,
  StageHint,
  StageOverlays
} from '../../features/session';
import { createEdgePull, menuGeometry } from '../../features/side-menu';
import { Cluster } from './Cluster';
import { createSummon, ringDelay } from './createSummon';
import { createViewDrag } from './createViewDrag';
import { DrawingSideMenu } from './DrawingSideMenu';
import { clusterLayout } from './layout';
import styles from './PuckStudio.module.css';
import type { SlotId } from './slots';

/**
 * The Puck variant: by default the screen is only the drawing, and the whole UI opens as one glass cluster under the
 * pen, after Procreate's QuickMenu and popovers (see `Cluster`). It opens where the session's navigation puck opens,
 * with the same triggers (Space held, V, the right button, a pen's barrel or side button), and with a finger's long
 * press; see `createSummon` for how it closes. Two- and three-finger taps undo and redo. What is not for drawing, such
 * as files and the session's windows, is in a side menu that pushes the drawing aside, opened from the pill in the
 * corner or by pulling three or four fingers in from the drawing's right edge; summoning the cluster closes it.
 */
export function PuckStudio(props: PaintVariantProps) {
  const session = createPaintSession();
  const { camera, engine, library, tools, brush, mixer, colorPicker, presets } = session;
  const view = createViewDrag({
    camera: camera.current,
    navigate: camera.navigate,
    size: session.size,
    origin: () => {
      const bounds = session.stage()?.getBoundingClientRect();
      return { x: bounds?.left ?? 0, y: bounds?.top ?? 0 };
    }
  });
  // Created before the canvas mounts: its window listeners must run before the navigation puck's; see `createSummon`.
  const summon = createSummon({ session, view, pivot: () => layout()?.center, run: runSlot });
  const layout = createMemo(() => {
    const at = summon.at();
    return at && clusterLayout(at, session.size(), summon.hand());
  });
  const [menuOpen, setMenuOpen] = createSignal(false);
  const edgePull = createEdgePull({
    target: session.stage,
    enabled: () => session.ready() && !menuOpen(),
    distance: () => menuGeometry(session.size()).panel,
    // The first fingers may have nudged the view before the last one landed.
    snapshot: () => {
      const view = camera.current();
      return () => camera.navigate(view);
    },
    onCommit: () => openMenu(true)
  });
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);

  session.createShortcuts({ closePanel: () => false });
  // The library lists the user's presets once it has read them.
  createEffect(
    () => summon.at() !== undefined,
    (open) => {
      if (open) {
        void library.loadAll();
      }
    }
  );
  // The cluster is summoned over the drawing, so the drawing comes back for it.
  createEffect(
    () => summon.at() !== undefined,
    (open) => {
      if (open) {
        setMenuOpen(false);
      }
    }
  );

  return (
    // The windows and the cluster step back with the drawing, so the side menu's card holds them too.
    <PaintEditor session={session} class={styles.editor} windows={false}>
      <DrawingSideMenu
        session={session}
        open={menuOpen()}
        onOpenChange={openMenu}
        progress={edgePull.progress()}
        experimentsHref={props.experimentsHref}
      >
        <PaintStage
          session={session}
          input={{
            touchGestures: {
              ...summon.touchGestures,
              // A quick pull lifts like a three-finger tap: the canvas saw none of its movement.
              tap: (fingers) => {
                if (!edgePull.pulled()) {
                  summon.touchGestures.tap(fingers);
                }
              }
            },
            puckPicker: summon.picker
          }}
        >
          <StageGuides session={session} />
          <Show when={session.ready() && engine.state().tileCount === 0 && !summon.at()}>
            <StageHint>Pen to draw. Hold Space, right-click, press the pen button or long-press for tools.</StageHint>
          </Show>
          {/* A press outside a toggled cluster only closes it, so the brush cursor would promise a stroke. */}
          <StageOverlays session={session} cursor={!summon.at() || camera.navigation.held()} />
        </PaintStage>
        <div class={styles.ui}>
          <Show when={layout()}>
            {(current) => (
              <Errored
                fallback={(error) => (
                  <div class={styles.crash} role="alert">
                    The cluster failed: {String(error())}
                  </div>
                )}
              >
                <Cluster
                  session={session}
                  layout={current()}
                  view={view}
                  summon={summon}
                  onAction={runSlot}
                  onOpenAbr={() => {
                    summon.close();
                    setAbrMounted(true);
                    setAbrOpen(true);
                  }}
                />
              </Errored>
            )}
          </Show>
          <Show when={summon.pressRing()}>
            {(at) => (
              <span
                class={styles.pressRing}
                style={{ left: `${at().x}px`, top: `${at().y}px`, 'animation-duration': `${500 - ringDelay}ms` }}
              />
            )}
          </Show>
          <SessionNotices session={session} />
        </div>
        <SessionWindows session={session} />
      </DrawingSideMenu>
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

  /** Opens or closes the side menu; the cluster gives way to it. */
  function openMenu(open: boolean) {
    if (open) {
      summon.close();
    }

    setMenuOpen(open);
  }

  /** Runs an instant QuickMenu button: undo and redo keep the cluster open, the eyedropper arms and finishes. */
  function runSlot(slot: SlotId) {
    if (slot === 'undo' && engine.state().canUndo) {
      session.undo();
    } else if (slot === 'redo' && engine.state().canRedo) {
      session.redo();
    } else if (slot === 'picker') {
      colorPicker.arm();
      summon.done();
    }
  }
}
