import { createEffect, createSignal, For, Show } from 'solid-js';
import { createFreshTab, FreshTabNotice } from '../features/fresh-tab';
import { createPalmRejection, createPalmRejectionSettings } from '../features/palm-rejection';
import { createPenHover } from '../features/pen-hover';
import { watchTapTargets } from '../mockups/puck-gallery/kit/watchTapTargets';
import styles from './ComponentCanvas.module.css';
import { createCanvasCamera } from './createCanvasCamera';
import { createCanvasGestures } from './createCanvasGestures';
import { createChoices, type ChoicesStatus } from './createChoices';
import { ColorPickers } from './groups/ColorPickers';
import { SpecimenChoices } from './Specimen';
import { createStripDevice, StripDevice } from './TestStrip';

/**
 * The component canvas (spec `apps/paint/docs/component-canvas.md`): Paint's own UI components side by side in their
 * variants and states on a canvas that fingers and the mouse move, so that the user can compare them, star the ones
 * to use and comment on them. The pen always works the components. Palm rejection and the move to a fresh tab when
 * Chrome loses the pen's hover are Paint's own, with Paint's settings.
 */
export function ComponentCanvas() {
  // A signal, as the canvas's listeners attach to it once it exists.
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  let world!: HTMLDivElement;

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
    world: () => world,
    // The viewport fills the window.
    viewport: () => ({ width: innerWidth, height: innerHeight })
  });
  const gestures = createCanvasGestures({ viewport, camera });
  const choices = createChoices();
  const stripDevice = createStripDevice();

  const fitAll = () => camera.show({ x: 0, y: 0, width: world.offsetWidth, height: world.offsetHeight });
  const showGroup = (id: string) => {
    const group = world.querySelector<HTMLElement>(`[data-group="${id}"]`);
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
        <div ref={world} class={styles.world}>
          <StripDevice value={stripDevice}>
            <SpecimenChoices value={choices}>
              <ColorPickers />
            </SpecimenChoices>
          </StripDevice>
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

/** The groups in canvas order, for the panel's list; each group's element carries the same `data-group`. */
const groups = [{ id: 'color-pickers', title: 'Color pickers' }] as const;

const statusText: Record<ChoicesStatus, string> = {
  loading: 'Loading stars…',
  saved: 'Stars saved',
  saving: 'Saving…',
  failed: 'Stars not saved',
  offline: 'Stars stay in this tab: no dev server'
};
