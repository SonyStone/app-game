import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { maxBrushSize, type PaintTool } from '../../features/brush';
import type { PaintSession } from '../../features/session';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { BrushLibrary, ToolCard } from './BrushCards';
import css from './cluster.module.css';
import { ColorCard } from './ColorCard';
import { Capsule, TapButton } from './controls';
import type { Summon } from './createSummon';
import type { ViewDrag } from './createViewDrag';
import { LayersCard } from './LayersCard';
import { placed, type Box, type ClusterLayout, type Point } from './layout';
import { QuickMenu } from './QuickMenu';
import { slots, type SlotId } from './slots';
import { formatValue, percentSetting, sizeSetting } from './values';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';

/**
 * The open cluster, after Procreate on the iPad: the QuickMenu as the Puck under the pen, with size and opacity
 * capsules beside it and the view pill under it; the tools and the Brush Library with the tool's settings on the pen
 * hand's side; Colors and Layers on the other side. While the view is dragged the rest hides; while size or opacity
 * change, the brush shows at its real size at the QuickMenu's center.
 *
 * Besides its parts it owns the keys that only work while it is open: 1–6 are the QuickMenu's buttons (1–3 drag the
 * view with the pointer while held), and `[` `]` flash the brush preview as the editor's shortcuts resize the brush.
 */
export function Cluster(props: {
  session: PaintSession;
  layout: ClusterLayout;
  view: ViewDrag;
  summon: Summon;
  /** Runs an instant QuickMenu button: undo, redo or the eyedropper. */
  onAction: (slot: SlotId) => void;
  onOpenAbr: () => void;
}) {
  const { session } = props;
  const { tools, brush, camera, engine } = session;
  /** A capsule or a size or opacity pill is being dragged, and which. */
  const [sizing, setSizing] = createSignal<{ kind: 'size' | 'opacity'; from: 'capsule' | 'pill' }>();
  /** A short preview after `[` or `]`. */
  const [flash, setFlash] = createSignal<'size'>();
  const preview = () => sizing()?.kind ?? flash();
  /** Whether the last press was a finger's: no hover feedback and no key hints then. */
  const [touch, setTouch] = createSignal(
    session.stage()?.closest<HTMLElement>('[data-pointer]')?.dataset.pointer === 'touch'
  );
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where the pen or the mouse last was, for the held digit keys' view drags. */
  let pointer: Point = props.layout.center;
  /** The held digit key that drags the view with the pointer. */
  let keyDrag: string | undefined;
  let stopWatching: (() => void) | undefined;
  onCleanup(() => {
    clearTimeout(flashTimer);
    stopWatching?.();
  });

  const center = () => props.layout.center;
  const brushTool = () => session.paintsWithBrush() && !session.transform.active();
  const finishSizing = () => {
    setSizing(undefined);
    props.summon.done();
  };
  /** What the QuickMenu's center says while the view is dragged: the zoom, the angle, or "Pan". */
  const readout = () => {
    const kind = props.view.kind();
    if (kind === 'zoom') {
      return `${Math.round(camera.camera().zoom * 100)}%`;
    }

    if (kind === 'rotate') {
      return `${Math.round((((((camera.camera().angle * 180) / Math.PI) % 360) + 540) % 360) - 180)}°`;
    }

    return kind === 'pan' ? 'Pan' : undefined;
  };

  setupKeys();

  return (
    <div
      ref={(element) => {
        stopWatching = watchTapTargets(element);
      }}
      class={css.root}
      data-puck-ui=""
      data-hover={touch() ? undefined : ''}
      data-nav={props.view.kind() ? '' : undefined}
      data-sizing={sizing()?.from ?? (flash() ? 'key' : undefined)}
      style={{ left: `${center().x}px`, top: `${center().y}px` }}
    >
      <div class={css.scaled} style={{ scale: `${props.layout.scale}` }}>
        <ToolsPill session={session} box={props.layout.boxes.tools} showKeys={!touch()} summon={props.summon} />
        <BrushLibrary
          session={session}
          box={props.layout.boxes.library}
          done={props.summon.done}
          onOpenAbr={props.onOpenAbr}
        />
        <ToolCard
          session={session}
          box={props.layout.boxes.studio}
          done={props.summon.done}
          onPreview={(kind) => setSizing(kind && { kind, from: 'pill' })}
        />
        <Capsule
          class={css.fades}
          box={props.layout.boxes.sizeBar}
          setting={brushTool() && !session.blockCursor() ? sizeSetting(maxBrushSize(brush())) : undefined}
          value={brush().size}
          onChange={(size) => tools.updateBrush({ size })}
          title="Brush size: drag, or [ and ]"
          glyph={
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2" />
              <circle cx="7" cy="7" r="2.5" fill="currentColor" />
            </svg>
          }
          onActive={(active) => setSizing(active ? { kind: 'size', from: 'capsule' } : undefined)}
          onDone={finishSizing}
        />
        <QuickMenu
          box={props.layout.boxes.ring}
          center={center()}
          view={props.view}
          onAction={props.onAction}
          canUndo={session.ready() && engine.state().canUndo}
          canRedo={session.ready() && engine.state().canRedo}
          highlighted={props.summon.highlighted()}
          readout={readout()}
          showKeys={!touch()}
          onNavigated={props.summon.done}
          close={props.summon.close}
        />
        <Capsule
          class={css.fades}
          box={props.layout.boxes.opacityBar}
          setting={brushTool() ? opacitySetting : undefined}
          value={Math.round(brush().opacity * 100)}
          onChange={(opacity) => tools.updateBrush({ opacity: opacity / 100 })}
          title="Opacity: drag"
          glyph={
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2" />
              <path d="M7 1a6 6 0 0 1 0 12Z" fill="currentColor" />
            </svg>
          }
          onActive={(active) => setSizing(active ? { kind: 'opacity', from: 'capsule' } : undefined)}
          onDone={finishSizing}
        />
        <ViewPill
          session={session}
          box={props.layout.boxes.view}
          center={center()}
          view={props.view}
          done={props.summon.done}
        />
        <ColorCard
          box={props.layout.boxes.color}
          color={brush().color}
          background={brush().backgroundColor ?? '#ffffff'}
          onColor={(color) => tools.updateBrush({ color })}
          onSwap={tools.swapColors}
          done={props.summon.done}
        />
        <LayersCard
          box={props.layout.boxes.layers}
          layers={engine.state().layers}
          activeId={engine.state().activeId}
          ready={session.ready()}
          onAction={(action) => session.edit({ type: 'layer', action })}
          done={props.summon.done}
          onEscape={props.summon.onEscape}
        />
      </div>
      <Show when={preview()}>{(kind) => <BrushPreview session={session} kind={kind()} />}</Show>
    </div>
  );

  /**
   * Window input while open: whether a finger is in use, the pointer for the held digit keys, and the keys: 1–6 are
   * the QuickMenu's buttons (1–3 drag the view with the pointer while held), `[` `]` flash the brush preview.
   */
  function setupKeys() {
    createEventListener(window, 'pointerdown', (event) => setTouch(event.pointerType === 'touch'), { capture: true });
    createEventListener(window, 'pointermove', (event) => {
      if (event.pointerType === 'touch') {
        return;
      }

      pointer = { x: event.clientX, y: event.clientY };
      if (touch()) {
        setTouch(false);
      }

      if (keyDrag) {
        props.view.move(pointer, event.shiftKey);
      }
    });
    createEventListener(window, 'keydown', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const slot = slots.find((entry) => `Digit${entry.key}` === event.code);
      if (slot) {
        event.preventDefault();
        if (slot.nav) {
          if (!keyDrag && !event.repeat) {
            keyDrag = event.code;
            props.view.start(slot.nav, pointer, center());
          }
        } else if (!event.repeat || slot.id !== 'picker') {
          props.onAction(slot.id);
        }

        return;
      }

      if (event.key === '[' || event.key === ']') {
        // The editor's shortcut changes the size; the cluster only shows it.
        setFlash('size');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => setFlash(undefined), 700);
      }
    });
    const endKeyDrag = () => {
      if (keyDrag) {
        keyDrag = undefined;
        props.view.end();
      }
    };
    createEventListener(window, 'keyup', (event) => event.code === keyDrag && endKeyDrag());
    createEventListener(window, 'blur', endKeyDrag);
    onCleanup(endKeyDrag);
  }
}

const opacitySetting = percentSetting('Opacity', 1);

/**
 * The tools as Procreate's icon row turned into a vertical pill: the brush tools, then the tools that work with the
 * selection and the transform, the chosen one lighter. Choosing a tool finishes. The Fill and the Gradient need a
 * selection. The last button switches the pen hand, whose side the tools and the brush cards take.
 */
function ToolsPill(props: { session: PaintSession; box: Box; showKeys: boolean; summon: Summon }) {
  const { session } = props;
  const active = (id: ToolId) =>
    id === 'transform' ? session.transform.active() : !session.transform.active() && session.tool() === id;
  const unavailable = (id: ToolId) => (id === 'fill' || id === 'gradient') && !session.selection.selected();
  const choose = (id: ToolId) => {
    if (id === 'transform') {
      session.toggleTransform();
    } else {
      session.chooseTool(id);
    }

    props.summon.done();
  };

  return (
    <nav class={[css.card, css.tools]} style={placed(props.box)}>
      <For each={toolItems}>
        {(item) => (
          <>
            <TapButton
              class={[css.tool, { [css.on!]: active(item.id) }]}
              title={
                unavailable(item.id)
                  ? `${item.label}: select an area first`
                  : `${item.label}${item.key ? ` (${item.key})` : ''}`
              }
              disabled={unavailable(item.id)}
              onTap={() => choose(item.id)}
            >
              <SketchIcon name={item.icon} size={22} />
              <Show when={props.showKeys && item.key}>
                <kbd>{item.key}</kbd>
              </Show>
            </TapButton>
            <Show when={item.id === 'eraser' || item.id === 'transform'}>
              <span class={css.toolGap} />
            </Show>
          </>
        )}
      </For>
      <TapButton
        class={[css.tool, css.hand]}
        title={`Pen hand: ${props.summon.hand()}. Tap to switch: the tools follow the pen hand.`}
        onTap={() => props.summon.setHand(props.summon.hand() === 'left' ? 'right' : 'left')}
      >
        {props.summon.hand() === 'left' ? 'L' : 'R'}
      </TapButton>
    </nav>
  );
}

/** The tools pill's tools, and the transform. */
type ToolId = PaintTool | 'transform';

const toolItems: readonly { id: ToolId; label: string; icon: SketchIconName; key?: string }[] = [
  { id: 'brush', label: 'Brush', icon: 'brush', key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: 'erase', key: 'E' },
  { id: 'lasso', label: 'Selection', icon: 'lasso', key: 'L' },
  { id: 'fill', label: 'Fill', icon: 'fill', key: 'G' },
  { id: 'gradient', label: 'Gradient', icon: 'gradient' },
  { id: 'transform', label: 'Transform', icon: 'move' }
];

/**
 * View extras under the QuickMenu: reset the view, zoom to 100% around the QuickMenu (the button shows the zoom),
 * mirror the view, vertical symmetry and full screen, the toggles lighter while on. Each finishes.
 */
function ViewPill(props: { session: PaintSession; box: Box; center: Point; view: ViewDrag; done: () => void }) {
  const { camera, symmetry, fullscreen } = props.session;
  const run = (action: () => void) => () => {
    action();
    props.done();
  };
  const toggleSymmetry = () => {
    const current = symmetry.symmetry();
    if (current.mode !== 'off') {
      symmetry.update({ ...current, mode: 'off' });
      return;
    }

    // The axis goes through the middle of the view, the camera's center.
    const { x, y } = camera.camera();
    symmetry.update({ ...current, mode: 'vertical', x, y });
  };

  return (
    <div class={[css.card, css.view]} style={placed(props.box)}>
      <TapButton class={css.viewButton} title="Reset the view: 100% at the origin" onTap={run(camera.reset)}>
        <SketchIcon name="home" size={18} />
      </TapButton>
      <TapButton class={css.viewButton} title="Zoom to 100%" onTap={run(() => props.view.zoomTo(1, props.center))}>
        {Math.round(camera.camera().zoom * 100)}%
      </TapButton>
      <TapButton
        class={[css.viewButton, { [css.on!]: camera.camera().mirrored }]}
        title="Mirror the view"
        onTap={run(camera.toggleMirror)}
      >
        <SketchIcon name="mirror" size={18} />
      </TapButton>
      <TapButton
        class={[css.viewButton, { [css.on!]: symmetry.symmetry().mode !== 'off' }]}
        title="Symmetry"
        disabled={!props.session.canUpdateSymmetry()}
        onTap={run(toggleSymmetry)}
      >
        <SketchIcon name="symmetry" size={18} />
      </TapButton>
      <TapButton
        class={[css.viewButton, { [css.on!]: fullscreen.isActive() }]}
        title={fullscreen.props['aria-label']}
        disabled={fullscreen.props.disabled}
        onTap={run(() => void fullscreen.props.onClick())}
      >
        <SketchIcon name={fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'} size={18} />
      </TapButton>
    </div>
  );
}

/**
 * The brush at its real size on screen, at the QuickMenu's center, while size or opacity change: filled with the
 * color at the brush's opacity and hardness (an outline for the eraser), with the value beneath.
 */
function BrushPreview(props: { session: PaintSession; kind: 'size' | 'opacity' }) {
  const { brush, camera } = props.session;
  const diameter = () => Math.min(2400, Math.max(3, brush().size * camera.camera().zoom));
  const erasing = () => props.session.tool() === 'eraser';
  const hardness = () => (brush().engine === undefined ? brush().hardness * 100 : 100);
  const label = () =>
    props.kind === 'size' ? `${formatValue(brush().size)} px` : `${Math.round(brush().opacity * 100)}% opacity`;

  return (
    <>
      <span
        class={css.preview}
        style={{
          width: `${diameter()}px`,
          height: `${diameter()}px`,
          opacity: erasing() ? 1 : brush().opacity,
          background: erasing()
            ? 'rgb(255 255 255 / 0.12)'
            : `radial-gradient(circle closest-side, ${brush().color} ${Math.min(98, hardness())}%, transparent 100%)`
        }}
      />
      <span class={[css.preview, css.previewOutline]} style={{ width: `${diameter()}px`, height: `${diameter()}px` }} />
      {/* Above the brush, inside the QuickMenu, clear of the view pill under it. */}
      <span class={css.previewLabel} style={{ top: `${-Math.min(76, diameter() / 2 + 22)}px` }}>
        {label()}
      </span>
    </>
  );
}
