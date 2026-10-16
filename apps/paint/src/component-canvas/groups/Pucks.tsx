import { attachNavigationPuck, createNavigationPuck, NavigationPuck } from '@app-game/navigation-puck';
import { createSignal, onSettled, Show, untrack } from 'solid-js';
import { createRadialMenu, RadialMenu, radialLayout, type RadialItem } from '../../features/radial-menu';
import { pie } from '../../mockups/puck-gallery/variants/pie';
import styles from '../ComponentCanvas.module.css';
import { GalleryStage } from '../GalleryStage';
import { ScreenFrame, TryButton } from '../Screen';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Pucks and radial menus: Paint's navigation puck with its ring of actions closed, open and with a sector chosen,
 * and the Puck gallery's pie menu. Both cover the screen and read the pointer in window coordinates, so the canvas
 * shows their states in inert frames and opens a live one full screen.
 */
export function Pucks() {
  return (
    <CanvasGroup
      id="pucks"
      title="Pucks"
      omitted={
        <>
          The pie listens to the whole window for hover and keys, so it is only shown live, full screen, where every
          state appears as you use it. The ring's presets are Paint's two built-in ones. The Puck variant's own puck
          comes with the UI variants.
        </>
      }
    >
      <CanvasRow title="Navigation puck and ring (Paint)" note="pen: side button; mouse: right button; keys: Space">
        <Specimen id="pucks/paint/closed" label="Closed">
          <ScreenFrame width={frameSize} height={frameSize}>
            <span class={styles.screenNote}>Paint shows nothing until the puck is called</span>
          </ScreenFrame>
        </Specimen>
        <Specimen
          id="pucks/paint/open"
          label="Open"
          below={<TryButton label="Try full screen" title="Navigation puck and ring" render={() => <PuckStage />} />}
        >
          <ScreenFrame width={frameSize} height={frameSize}>
            <PaintPuck size={{ width: frameSize, height: frameSize }} />
          </ScreenFrame>
        </Specimen>
        <Specimen id="pucks/paint/chosen" label="Sector chosen (a right-drag toward Undo)">
          <ScreenFrame width={frameSize} height={frameSize}>
            <PaintPuck size={{ width: frameSize, height: frameSize }} highlighted="undo" />
          </ScreenFrame>
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Pie (Puck gallery)" note="after Blender's pie menus and Maya's marking menus">
        <Specimen
          id="pucks/gallery/pie"
          label="Pie"
          below={<TryButton label="Try full screen" title="Pie" render={() => <GalleryStage variant={pie} />} />}
        >
          <ScreenFrame width={frameSize} height={frameSize}>
            <span class={styles.screenNote}>
              Hover a direction and tap, or press, slide and lift. Tools, Color, Brush and Layers open their own pies.
            </span>
          </ScreenFrame>
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/**
 * Paint's navigation puck, open and pinned in the middle of a `size` screen, with its ring of actions; `highlighted`
 * lights the action a barrel-button drag points at. The puck navigates nothing.
 */
function PaintPuck(props: { size: { width: number; height: number }; highlighted?: string }) {
  const size = untrack(() => props.size);
  const navigation = createPaintNavigation(() => ({ left: 0, top: 0, ...size }));
  navigation.open({ x: size.width / 2, y: size.height / 2 }, 'pinned');

  return (
    <Show when={navigation.center()}>
      {(center) => (
        <NavigationPuck navigation={navigation} focusTarget={() => document.body}>
          <RadialMenu
            center={center()}
            items={ringItems()}
            highlighted={props.highlighted}
            hidden={false}
            onChoose={() => {}}
          />
        </NavigationPuck>
      )}
    </Show>
  );
}

/**
 * The puck and ring live over a blank surface, wired as in Paint: the pen's side button, the right mouse button,
 * Space and V open it, and a right-drag toward an action chooses it. Opens pinned in the middle.
 */
function PuckStage() {
  let surface!: HTMLCanvasElement;
  const [chosen, setChosen] = createSignal<string>();
  const navigation = createPaintNavigation(() => ({ left: 0, top: 0, width: innerWidth, height: innerHeight }));
  const radial = createRadialMenu({
    center: navigation.center,
    items: () => ringItems((label) => setChosen(label)),
    close: navigation.close
  });
  navigation.open(undefined, 'pinned');
  onSettled(() => attachNavigationPuck(surface, navigation, { busy: () => false, pick: radial.picker }));

  return (
    <>
      <canvas ref={surface} class={styles.stageSurface} tabindex={-1} />
      <p class={styles.stageHint}>
        {chosen() ? `Chose ${chosen()}. ` : ''}Pen: side button. Mouse: right button. Keys: Space or V.
      </p>
      <Show when={navigation.center()}>
        {(center) => (
          <NavigationPuck navigation={navigation} focusTarget={() => surface}>
            <RadialMenu
              center={center()}
              items={ringItems((label) => setChosen(label))}
              highlighted={radial.highlighted()}
              hidden={navigation.activeAction() !== undefined}
              onChoose={radial.choose}
            />
          </NavigationPuck>
        )}
      </Show>
    </>
  );
}

/** A navigation puck as Paint sizes it for its ring, over `viewport`, navigating nothing. */
function createPaintNavigation(viewport: () => { left: number; top: number; width: number; height: number }) {
  return createNavigationPuck({
    viewport,
    mode: () => '2d',
    rotation: () => 0,
    transform: () => {},
    orbit: () => {},
    size: radialLayout.puck,
    reach: radialLayout.reach
  });
}

/**
 * Paint's ring of actions in Paint's slots (see `radialItems` in `PaintStudio`), with the brush as the current tool
 * and the two built-in presets as the recent ones. `run` receives the label of a chosen action.
 */
function ringItems(run: (label: string) => void = () => {}): RadialItem[] {
  const item = (entry: Omit<RadialItem, 'run'>): RadialItem => ({ ...entry, run: () => run(entry.label) });

  return [
    item({ id: 'tool:brush', label: 'Brush', icon: 'draw', slot: 0, active: true }),
    item({ id: 'tool:eraser', label: 'Eraser', icon: 'erase', slot: 1 }),
    item({ id: 'redo', label: 'Redo', icon: 'redo', slot: 3, disabled: true }),
    item({ id: 'preset:soft-round', label: 'Brush preset: Soft round', text: 'SR', slot: 6 }),
    item({ id: 'preset:eraser', label: 'Brush preset: Eraser', text: 'ERA', slot: 5 }),
    item({ id: 'picker', label: 'Pick color from canvas', icon: 'picker', slot: 8 }),
    item({ id: 'undo', label: 'Undo', icon: 'undo', slot: 9 }),
    item({ id: 'transform', label: 'Transform', icon: 'move', slot: 10 }),
    item({ id: 'tool:lasso', label: 'Lasso', icon: 'lasso', slot: 11 })
  ];
}

/** Each frame stands for a screen just large enough for the puck's ring and the caption under it. */
const frameSize = 320;
