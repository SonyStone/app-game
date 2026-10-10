import { screenToWorld } from '@app-game/paint-core/camera';
import { Show } from 'solid-js';
import type { PaintSession } from '../../features/session';
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import type { DesktopTool } from './createDesktopTools';
import styles from './StatusBar.module.css';
import { angleDegrees } from './viewDrag';

/**
 * The status bar: what the tool in use does with the pen, the cursor's position in document pixels, the zoom as a
 * scrub field, the view's rotation (pressing it resets it), the active layer and whether the drawing is saved.
 */
export function StatusBar(props: { session: PaintSession; tool: DesktopTool }) {
  const { camera, engine, size } = props.session;
  const position = () => {
    const point = props.session.cursor();
    return point && screenToWorld(point, camera.camera(), size());
  };
  const layerName = () => engine.state().layers.find((layer) => layer.id === engine.state().activeId)?.name ?? '';
  const angle = () => angleDegrees(camera.camera().angle);

  return (
    <footer class={styles.bar} aria-label="Status">
      <span class={styles.hint}>{hints[props.tool]}</span>
      <span class={styles.item} title="Cursor position in document pixels">
        <Show when={position()} fallback="X –  Y –">
          {(point) => `X ${Math.round(point().x)}  Y ${Math.round(point().y)}`}
        </Show>
      </span>
      <span class={styles.item} title="Active layer">
        {layerName()}
      </span>
      <span class={styles.zoom}>
        <ScrubNumber
          label="Zoom"
          value={Math.round(camera.camera().zoom * 100)}
          min={5}
          max={3200}
          scale="log"
          unit="%"
          onInput={(percent) => camera.navigate({ ...camera.current(), zoom: percent / 100 })}
          onChange={(percent) => camera.navigate({ ...camera.current(), zoom: percent / 100 })}
        />
      </span>
      <button
        class={styles.item}
        title={angle() === 0 ? 'View rotation' : 'View rotation: press to reset'}
        disabled={angle() === 0}
        onClick={camera.resetRotation}
      >
        ⟳ {angle()}°{camera.camera().mirrored ? ' · mirrored' : ''}
      </button>
      <span class={styles.save} data-state={engine.saveState()} title="Autosave in this browser">
        <span class={styles.dot} />
        {saveLabels[engine.saveState()]}
      </span>
    </footer>
  );
}

const saveLabels: Record<ReturnType<PaintSession['engine']['saveState']>, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved'
};

/** What the pen does with each tool, and the keys that change it. */
const hints: Record<DesktopTool, string> = {
  brush: 'Draw · [ ] size · Alt picks a color · Space or right button: view puck · two fingers tap: undo',
  eraser: 'Erase · [ ] size · B for the brush',
  select: 'Draw a selection · Shift adds, Alt subtracts · Enter closes a polygon · Ctrl+D deselects',
  fill: 'Click to fill inside the selection · Alt picks a color',
  gradient: 'Drag to draw a gradient inside the selection',
  'local-undo': 'Mark part of the layer to return it to an earlier state · Enter applies, Esc cancels',
  transform: 'Drag inside to move, handles to scale and rotate · Enter applies, Esc cancels',
  eyedropper: 'Press the canvas to pick a color; the tool returns afterwards',
  view: 'Drag to move the view · Z zooms, R rotates, H pans · wheel zooms'
};
