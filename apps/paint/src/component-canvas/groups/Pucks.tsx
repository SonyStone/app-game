import { attachNavigationPuck, createNavigationPuck, NavigationPuck } from '@app-game/navigation-puck';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createSignal, onSettled, Show, untrack } from 'solid-js';
import { createRadialMenu, RadialMenu, radialLayout, type RadialItem } from '../../features/radial-menu';
import { pie } from '../../mockups/puck-gallery/variants/pie';
import { Capsule } from '../../variants/puck/controls';
import { createViewDrag } from '../../variants/puck/createViewDrag';
import { QuickMenu } from '../../variants/puck/QuickMenu';
import { percentSetting, sizeSetting } from '../../variants/puck/values';
import { Fan } from '../../variants/zen/Fan';
import { Pebble } from '../../variants/zen/Pebble';
import { inwardAngle } from '../../variants/zen/placement';
import { RewindRing } from '../../variants/zen/RewindRing';
import { defaultSlots, starterColors } from '../../variants/zen/tools';
import zen from '../../variants/zen/ZenStudio.module.css';
import styles from '../ComponentCanvas.module.css';
import { PuckFrame, puckBoxes } from '../frames';
import { GalleryLive, GalleryStage } from '../GalleryStage';
import { ScreenFrame, TryButton } from '../Screen';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Pucks and radial menus: Paint's navigation puck with its ring of actions closed, open and with a sector chosen, the
 * Puck variant's QuickMenu, the Zen pebble with its fan and rewind dial, and the Puck gallery's pie menu. Those that
 * cover the screen and read the pointer in window coordinates show their states in inert frames, and the canvas opens
 * a live one full screen.
 */
export function Pucks() {
  return (
    <CanvasGroup
      id="pucks"
      title="Pucks"
      omitted={
        <>
          The ring's presets are Paint's two built-in ones. The Puck variant's own puck
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

      <CanvasRow title="Puck variant" note="the QuickMenu with its size and opacity capsules, as the cluster opens">
        <Specimen id="pucks/puck-variant/quick-menu" label="QuickMenu and capsules">
          <PuckQuickMenu />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Zen pebble" note="its states in screen frames; open the whole variant from Whole UIs">
        <Specimen id="pucks/zen/pebble" label="Pebble">
          <ScreenFrame width={zenScreen.width} height={zenScreen.height} class={zen.editor}>
            <div class={zen.ui}>
              <ZenPebble open={false} />
            </div>
          </ScreenFrame>
        </Specimen>
        <Specimen id="pucks/zen/fan" label="Fan open">
          <ScreenFrame width={zenScreen.width} height={zenScreen.height} class={zen.editor}>
            <div class={zen.ui}>
              <ZenFan />
              <ZenPebble open />
            </div>
          </ScreenFrame>
        </Specimen>
        <Specimen id="pucks/zen/rewind" label="Rewind dial (two-finger turn)">
          <ScreenFrame width={zenScreen.width} height={zenScreen.height} class={zen.editor}>
            <div class={zen.ui}>
              <RewindRing
                dial={{ center: zenPebbleAt, radius: 90, start: -Math.PI / 2, turned: -1.6, steps: -3, step: 0.5 }}
              />
              <ZenPebble open={false} counter="−3" />
            </div>
          </ScreenFrame>
        </Specimen>
      </CanvasRow>

      <CanvasRow
        title="Pie (Puck gallery)"
        note="after Blender's pie menus and Maya's marking menus; hover a direction and tap, or press, slide and lift"
      >
        <Specimen
          id="pucks/gallery/pie"
          label="Pie"
          below={<TryButton label="Try full screen" title="Pie" render={() => <GalleryStage variant={pie} />} />}
        >
          <GalleryLive variant={pie} />
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

/**
 * The Puck variant's QuickMenu between its size and opacity capsules, placed as the variant places them. The view
 * buttons drag nothing here; the capsules change values of their own.
 */
function PuckQuickMenu() {
  const [size, setSize] = createSignal(32);
  const [opacity, setOpacity] = createSignal(100);
  const view = createViewDrag({
    camera: () => defaultCamera(),
    navigate: () => {},
    size: () => ({ width: innerWidth, height: innerHeight }),
    origin: () => ({ x: 0, y: 0 })
  });
  const glyph = (fill: 'dot' | 'half') => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2" />
      {fill === 'dot' ? (
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
      ) : (
        <path d="M7 1a6 6 0 0 1 0 12Z" fill="currentColor" />
      )}
    </svg>
  );

  return (
    <PuckFrame boxes={[puckBoxes.sizeBar, puckBoxes.ring, puckBoxes.opacityBar]}>
      <Capsule
        box={puckBoxes.sizeBar}
        setting={sizeSetting(512)}
        value={size()}
        onChange={setSize}
        title="Brush size: drag"
        glyph={glyph('dot')}
        onActive={() => {}}
        onDone={() => {}}
      />
      <QuickMenu
        box={puckBoxes.ring}
        center={{ x: innerWidth / 2, y: innerHeight / 2 }}
        view={view}
        onAction={() => {}}
        canUndo
        canRedo={false}
        highlighted={undefined}
        readout={undefined}
        showKeys
        onNavigated={() => {}}
        close={() => {}}
      />
      <Capsule
        box={puckBoxes.opacityBar}
        setting={percentSetting('Opacity', 1)}
        value={opacity()}
        onChange={setOpacity}
        title="Opacity: drag"
        glyph={glyph('half')}
        onActive={() => {}}
        onDone={() => {}}
      />
    </PuckFrame>
  );
}

/** The Zen pebble resting in the frame's lower right, with the starting brush; `open` shows it with its fan. */
function ZenPebble(props: { open: boolean; counter?: string }) {
  return (
    <Pebble
      center={zenPebbleAt}
      view={zenScreen}
      hand="right"
      hidden={false}
      open={props.open}
      lifted={false}
      brush={{ size: 12, opacity: 1, color: '#1d1d1f' }}
      erasing={false}
      zoom={1}
      maxSize={512}
      adjustable
      counter={props.counter}
      onTap={() => {}}
      onCarry={() => {}}
      onDrop={() => {}}
      onAdjust={() => {}}
      onAdjusted={() => {}}
    />
  );
}

/** The Zen fan around the pebble: its default brushes, the starter colors and history. */
function ZenFan() {
  return (
    <Fan
      center={zenPebbleAt}
      inward={inwardAngle(zenPebbleAt, zenScreen)}
      view={zenScreen}
      quiet={false}
      slots={defaultSlots}
      active={0}
      erasing={false}
      colors={starterColors}
      canUndo
      canRedo={false}
      moreOpen={false}
      onUndo={() => {}}
      onRedo={() => {}}
      onMore={() => {}}
      onSlot={() => {}}
      onSlotHold={() => {}}
      onEraser={() => {}}
      onColor={() => {}}
      onColorHold={() => {}}
    />
  );
}

/** A Zen screen: large enough for the fan around a pebble resting near its lower right corner. */
const zenScreen = { width: 520, height: 520 };
const zenPebbleAt = { x: 400, y: 400 };

/** Each frame stands for a screen just large enough for the puck's ring and the caption under it. */
const frameSize = 320;
