import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import { createFreshTab, FreshTabNotice } from '../features/fresh-tab';
import { createPalmRejection, createPalmRejectionSettings } from '../features/palm-rejection';
import { createPenHover } from '../features/pen-hover';
import { watchTapTargets } from '../mockups/puck-gallery/kit/watchTapTargets';
import styles from './ComponentCanvas.module.css';
import { createCanvasCamera } from './createCanvasCamera';
import { createCanvasGestures } from './createCanvasGestures';
import { createChoices, type ChoicesStatus } from './createChoices';
import { createViewportPopups } from './createViewportPopups';
import { BrushCards } from './groups/BrushCards';
import { ColorPickers } from './groups/ColorPickers';
import { Icons } from './groups/Icons';
import { LayersPanels } from './groups/LayersPanels';
import { Numbers } from './groups/Numbers';
import { Pucks } from './groups/Pucks';
import { Styles } from './groups/Styles';
import { CanvasStage, type Stage } from './Screen';
import { SpecimenChoices } from './Specimen';
import { createStripDevice, StripDevice } from './TestStrip';

/**
 * The component canvas: Paint's own UI components side by side in their variants and states on a canvas that fingers
 * and the mouse move, so that the user can compare them, star the ones to use and comment on them. Whole UIs are
 * variant pages; the canvas holds their parts, and what wins here moves into the variants.
 *
 * - The canvas mounts the very modules the app uses, never copies, and does not change them; a component that only
 *   works inside the drawing session is unbound through props, which needs the user's consent. A component the app
 *   lacks, such as a new color wheel, is built as an ordinary feature module, not as canvas code.
 * - At 100 % a component is as large as in the app; there is no real-millimetre zoom (the user: "100 % is 100 %").
 * - The pen always works the components; see `createCanvasGestures` for fingers and the mouse.
 * - Palm rejection and the move to a fresh tab when Chrome loses the pen's hover are Paint's own, with Paint's
 *   settings (the Drawing menu). They are wired here directly; once the drawing session owns them, use the session's.
 * - The canvas keeps only its camera; stars and comments go to the repository through `createChoices`.
 *
 * Served at `/paint/components` of the web app, so that `pnpm dev:tablet` opens it on the tablet. Type the address in
 * a new tab: a tab opened by `adb shell am start` loses the pen's hover.
 */
export function ComponentCanvas() {
  // Signals, as listeners and observers attach to the elements once they exist.
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [world, setWorld] = createSignal<HTMLDivElement>();
  const [stage, setStage] = createSignal<Stage>();

  // Paint's own guards first: palm rejection must see touches before the canvas does, and the pen hover detection
  // before palm rejection, so that the press that finds the pen without hover is guarded as such.
  const penHover = createPenHover();
  const palmOptions = createPalmRejectionSettings().settings;
  const hoverless = () => {
    const mode = palmOptions().hoverless;
    return mode === 'on' || (mode === 'auto' && penHover.hovers() === false);
  };
  createPalmRejection({
    enabled: () => palmOptions().enabled,
    hand: () => palmOptions().hand,
    tolerance: () => palmOptions().tolerance,
    linger: () => (hoverless() ? palmOptions().liftLinger : palmOptions().linger),
    before: () => (hoverless() ? palmOptions().before : 0),
    onRetract: (pointerIds) => gestures.retract(pointerIds)
  });
  // The canvas keeps nothing but its camera, so moving is only opening the page anew.
  const freshTab = createFreshTab({
    lostContacts: penHover.lostContacts,
    idle: () => true,
    moveOut: async () => true
  });

  const camera = createCanvasCamera({
    world,
    // The viewport fills the window.
    viewport: () => ({ width: innerWidth, height: innerHeight }),
    onApply: () => popups.update()
  });
  const popups = createViewportPopups({ world, camera: camera.current });
  const gestures = createCanvasGestures({ viewport, camera });
  const choices = createChoices();
  const stripDevice = createStripDevice();

  // Both run from handlers and from the mount effect's callback, which must not read signals.
  const fitAll = () => {
    const element = untrack(world);
    if (element) {
      camera.show({ x: 0, y: 0, width: element.offsetWidth, height: element.offsetHeight });
    }
  };
  const showGroup = (id: string) => {
    const group = untrack(world)?.querySelector<HTMLElement>(`[data-group="${id}"]`);
    if (group) {
      camera.show({ x: group.offsetLeft, y: group.offsetTop, width: group.offsetWidth, height: group.offsetHeight });
    }
  };

  createEffect(viewport, (element) => {
    if (!element) {
      return;
    }

    if (camera.remembered) {
      camera.apply();
    } else {
      fitAll();
    }

    // The page must not bounce or pull to refresh under a pan.
    document.documentElement.style.setProperty('overscroll-behavior', 'none');
    const stopWatching = watchTapTargets(element);
    return () => {
      stopWatching();
      document.documentElement.style.removeProperty('overscroll-behavior');
    };
  });

  return (
    <div class={styles.page}>
      <div ref={setViewport} class={styles.viewport}>
        <div ref={setWorld} class={styles.world}>
          <CanvasStage value={setStage}>
            <StripDevice value={stripDevice}>
              <SpecimenChoices value={choices}>
                <ColorPickers />
                <BrushCards />
                <LayersPanels />
                <Numbers />
                <Icons />
                <Pucks />
                <Styles />
              </SpecimenChoices>
            </StripDevice>
          </CanvasStage>
        </div>
      </div>

      <nav class={styles.panel} data-canvas-ui aria-label="Canvas">
        <button onClick={fitAll}>Fit all</button>
        <button
          title="Back to 100 %"
          onClick={() => camera.zoomAt({ x: innerWidth / 2, y: innerHeight / 2 }, 1 / camera.current().zoom)}
        >
          {Math.round(camera.zoom() * 100)} %
        </button>
        <span class={styles.panelGap} />
        <For each={groups}>{(group) => <button onClick={() => showGroup(group.id)}>{group.title}</button>}</For>
        <span class={styles.panelStatus} role="status">
          {statusText[choices.status()]}
        </span>
      </nav>

      <Show when={stage()}>
        {(current) => <StageView stage={current()} onClose={() => setStage(undefined)} />}
      </Show>

      <Show when={freshTab.offered()}>
        <FreshTabNotice
          size={{ width: innerWidth, height: innerHeight }}
          blocked={freshTab.blocked()}
          auto={freshTab.auto()}
          onMove={freshTab.move}
          onAutoChange={freshTab.setAuto}
          onDismiss={freshTab.dismiss}
        />
      </Show>
    </div>
  );
}

/**
 * A component opened full screen over the canvas, outside the moving world, where it sees the real window as in the
 * app. The canvas's gestures leave it alone, as it is outside the canvas's viewport.
 */
function StageView(props: { stage: Stage; onClose: () => void }): JSX.Element {
  return (
    <div class={styles.stage} role="dialog" aria-label={props.stage.title}>
      {props.stage.render()}
      <div class={styles.stageBar}>
        <span>{props.stage.title}</span>
        <button onClick={() => props.onClose()}>Back to the canvas</button>
      </div>
    </div>
  );
}

/** The groups in canvas order, for the panel's list; each group's element carries the same `data-group`. */
const groups = [
  { id: 'color-pickers', title: 'Color pickers' },
  { id: 'brush-cards', title: 'Brushes' },
  { id: 'layers', title: 'Layers' },
  { id: 'numbers', title: 'Numbers' },
  { id: 'icons', title: 'Icons' },
  { id: 'pucks', title: 'Pucks' },
  { id: 'styles', title: 'Styles' }
] as const;

const statusText: Record<ChoicesStatus, string> = {
  loading: 'Loading stars…',
  saved: 'Stars saved',
  saving: 'Saving…',
  failed: 'Stars not saved',
  offline: 'Stars stay in this tab: no dev server'
};
