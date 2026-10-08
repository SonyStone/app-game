import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { tools, type ToolId } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { formatValue, stepPreset, type NumberSetting } from '../../kit/values';
import { galleryUi, type Summon, type VariantProps } from '../../kit/variant';
import { BrushLibrary, BrushStudio } from './BrushCards';
import { ColorCard } from './ColorCard';
import { Capsule, TapButton } from './controls';
import css from './glass.module.css';
import { LayersCard } from './LayersCard';
import { clusterLayout, placed, type Box } from './layout';
import { createGlassNavigation } from './navigation';
import { QuickMenu, slots, slotToward, type Slot, type SlotId } from './QuickMenu';

/**
 * Glass, after Procreate and iPadOS: Procreate's QuickMenu as the Puck under the pen, with its two sidebar sliders
 * (size and opacity) as capsules beside it, and Procreate's popovers as floating glass cards around it: the tools as
 * a vertical pill and the Brush Library with a simplified Brush Studio on the hand's side, Colors (the Disc) and
 * Layers on the other side, and the view extras under the QuickMenu.
 */
export function GlassVariant(props: VariantProps) {
  return (
    <Show when={props.summon}>
      {(summon) => (
        <Cluster
          studio={props.studio}
          summon={summon()}
          pointer={props.pointer}
          hand={props.hand}
          hidden={props.hidden}
          close={props.close}
          done={props.done}
        />
      )}
    </Show>
  );
}

/**
 * The open cluster. Besides its parts it owns the input that spans them: the opening press's flick toward a
 * QuickMenu button, the keys, and the brush preview while size or opacity change.
 */
function Cluster(
  props: Pick<VariantProps, 'studio' | 'pointer' | 'hand' | 'hidden' | 'close' | 'done'> & { summon: Summon }
) {
  const [viewport, setViewport] = createSignal({ width: innerWidth, height: innerHeight });
  const layout = createMemo(() => clusterLayout(props.summon.at, viewport(), props.hand));
  const navigation = createGlassNavigation(
    untrack(() => props.studio),
    () => layout().center
  );
  /** A bar or a size or opacity pill is being dragged. */
  const [sizing, setSizing] = createSignal<'size' | 'opacity'>();
  /** A short preview after `[` or `]`. */
  const [flash, setFlash] = createSignal<'size'>();
  const preview = () => sizing() ?? flash();
  const [highlighted, setHighlighted] = createSignal<SlotId>();
  /** Whether the last press was a finger's: no hover feedback and no key hints then. */
  const [touch, setTouch] = createSignal(() => props.summon.pointerType === 'touch');
  const serial = createMemo(() => props.summon.serial);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(flashTimer));
  /** The opening press while it is still down: where it started, the slot it points at, and whether it navigates. */
  let flick: { id: number; origin: Point; slot?: Slot; navigating: boolean } | undefined;
  /** The held digit key that navigates with the pointer. */
  let keyNavigation: string | undefined;
  /** The layers card's Escape: closes its blend sheet or revealed actions first, and says whether it did. */
  let escapeLayers: (() => boolean) | undefined;

  const numberSetting = (key: string) =>
    props.studio
      .settings()
      .find((setting): setting is NumberSetting => setting.kind === 'number' && setting.key === key);
  const run = (slot: SlotId, finish = true) => {
    if (slot === 'undo') {
      props.studio.undo();
    } else if (slot === 'redo') {
      props.studio.redo();
    } else if (slot === 'picker') {
      props.studio.setTool('picker');
      if (finish) {
        props.done();
      } else {
        props.studio.notify('Eyedropper');
      }
    }
  };
  const stepSize = (direction: 1 | -1) => {
    const setting = numberSetting('size');
    if (!setting) {
      return;
    }

    props.studio.setValue('size', stepPreset(setting, props.studio.number('size'), direction));
    setFlash('size');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setFlash(undefined), 700);
  };
  /** What the QuickMenu's center says while navigating: the zoom, the angle, or "Pan". */
  const readout = () => {
    const kind = navigation.kind();
    if (kind === 'zoom') {
      return `${Math.round(props.studio.view().scale * 100)}%`;
    }

    if (kind === 'rotate') {
      return `${Math.round(props.studio.view().angle)}°`;
    }

    return kind === 'pan' ? 'Pan' : undefined;
  };

  createEffect(serial, () => {
    const { heldPointer, at } = untrack(() => props.summon);
    flick = heldPointer === undefined ? undefined : { id: heldPointer, origin: at, navigating: false };
    setHighlighted(undefined);
  });
  setupInput();

  return (
    <div
      class={css.root}
      data-glass=""
      data-hover={touch() ? undefined : ''}
      data-nav={navigation.kind() ? '' : undefined}
      data-sizing={preview() ? '' : undefined}
      style={{
        left: `${layout().center.x}px`,
        top: `${layout().center.y}px`,
        visibility: props.hidden ? 'hidden' : undefined
      }}
    >
      <div class={css.scaled} style={{ scale: `${layout().scale}` }}>
        <ToolsPill studio={props.studio} box={layout().boxes.tools} showKeys={!touch()} done={props.done} />
        <BrushLibrary studio={props.studio} box={layout().boxes.library} done={props.done} />
        <BrushStudio studio={props.studio} box={layout().boxes.studio} onPreview={setSizing} />
        <Capsule
          class={css.fades}
          box={layout().boxes.sizeBar}
          setting={numberSetting('size')}
          value={props.studio.number('size')}
          onChange={(value) => props.studio.setValue('size', value)}
          title="Brush size: drag, or [ and ]"
          glyph={
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2" />
              <circle cx="7" cy="7" r="2.5" fill="currentColor" />
            </svg>
          }
          onActive={(active) => setSizing(active ? 'size' : undefined)}
        />
        <QuickMenu
          studio={props.studio}
          box={layout().boxes.ring}
          center={layout().center}
          navigation={navigation}
          onAction={(slot) => run(slot)}
          highlighted={highlighted()}
          readout={readout()}
          showKeys={!touch()}
          close={props.close}
        />
        <Capsule
          class={css.fades}
          box={layout().boxes.opacityBar}
          setting={numberSetting('opacity')}
          value={props.studio.number('opacity')}
          onChange={(value) => props.studio.setValue('opacity', value)}
          title="Opacity: drag"
          glyph={
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.2" />
              <path d="M7 1a6 6 0 0 1 0 12Z" fill="currentColor" />
            </svg>
          }
          onActive={(active) => setSizing(active ? 'opacity' : undefined)}
        />
        <ViewPill studio={props.studio} box={layout().boxes.view} center={layout().center} />
        <ColorCard studio={props.studio} box={layout().boxes.color} done={props.done} />
        <LayersCard
          studio={props.studio}
          box={layout().boxes.layers}
          done={props.done}
          onEscape={(handler) => {
            escapeLayers = handler;
          }}
        />
      </div>
      <Show when={preview()}>{(kind) => <BrushPreview studio={props.studio} kind={kind()} />}</Show>
    </div>
  );

  /**
   * Window input while open: the viewport's size, whether a finger is in use, the opening press's flick (a move
   * toward a button highlights it; a release runs it, and Pan, Zoom and Rotate start navigating once the move reaches
   * the ring, finishing on release), and the keys: B, E and S choose tools, `[` `]` step the size, 1–6 are the
   * QuickMenu's buttons (1–3 navigate with the pointer while held), Esc closes.
   */
  function setupInput() {
    createEventListener(window, 'resize', () => setViewport({ width: innerWidth, height: innerHeight }));
    createEventListener(window, 'pointerdown', (event) => setTouch(event.pointerType === 'touch'), { capture: true });
    createEventListener(window, 'pointermove', (event) => {
      const at = { x: event.clientX, y: event.clientY };
      if (event.pointerType !== 'touch' && touch()) {
        setTouch(false);
      }

      if (keyNavigation) {
        navigation.move(at, event.shiftKey);
      }

      if (flick?.id !== event.pointerId) {
        return;
      }

      if (flick.navigating) {
        navigation.move(at, event.shiftKey);
        return;
      }

      const dx = at.x - flick.origin.x;
      const dy = at.y - flick.origin.y;
      const distance = Math.hypot(dx, dy);
      const slot = distance >= flickDeadZone ? slotToward(dx, dy) : undefined;
      flick.slot = slot;
      if (slot?.nav && distance >= flickReach) {
        flick.navigating = true;
        setHighlighted(undefined);
        navigation.start(slot.nav, at);
        return;
      }

      setHighlighted(slot?.id);
    });
    createEventListener(window, 'pointerup', (event) => {
      if (flick?.id !== event.pointerId) {
        return;
      }

      // The opening press ends here; later presses of the same pointer id are ordinary presses.
      const ended = flick;
      flick = undefined;
      setHighlighted(undefined);
      if (ended.navigating) {
        navigation.end();
        props.done();
      } else if (ended.slot && !ended.slot.nav) {
        run(ended.slot.id);
      }
    });
    createEventListener(window, 'pointercancel', (event) => {
      if (flick?.id === event.pointerId) {
        if (flick.navigating) {
          navigation.end();
        }

        flick = undefined;
        setHighlighted(undefined);
      }
    });
    createEventListener(
      window,
      'keydown',
      (event) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          if (!escapeLayers?.()) {
            props.close();
          }

          return;
        }

        const slot = slots.find((entry) => `Digit${entry.key}` === event.code);
        if (slot) {
          event.preventDefault();
          if (slot.nav) {
            if (!keyNavigation && !event.repeat) {
              keyNavigation = event.code;
              navigation.start(slot.nav, props.pointer);
            }
          } else if (!event.repeat || slot.id !== 'picker') {
            run(slot.id, false);
          }

          return;
        }

        const tool = toolKeys[event.code];
        if (tool) {
          event.preventDefault();
          props.studio.setTool(tool);
          props.studio.notify(tools.find((entry) => entry.id === tool)!.label);
          return;
        }

        if (event.key === '[' || event.key === ']') {
          event.preventDefault();
          stepSize(event.key === ']' ? 1 : -1);
        }
      },
      { capture: true }
    );
    const endKeyNavigation = () => {
      if (keyNavigation) {
        keyNavigation = undefined;
        navigation.end();
      }
    };
    createEventListener(window, 'keyup', (event) => event.code === keyNavigation && endKeyNavigation(), {
      capture: true
    });
    createEventListener(window, 'blur', endKeyNavigation);
    onCleanup(endKeyNavigation);
  }
}

/** How far the opening press must move before it points at a button, and before Pan, Zoom or Rotate take over. */
const flickDeadZone = 22;
const flickReach = 62;

/** Procreate's tool letters while the cluster is open; S, its smudge, is the mixer here. */
const toolKeys: Partial<Record<string, ToolId>> = { KeyB: 'brush', KeyE: 'eraser', KeyS: 'mixer' };

/**
 * The tools as Procreate's icon row turned into a vertical pill; the active one in blue. Choosing a tool finishes.
 * Key hints show for the mouse and the pen.
 */
function ToolsPill(props: { studio: Studio; box: Box; showKeys: boolean; done: () => void }) {
  return (
    <nav class={[css.card, css.tools]} style={placed(props.box)} {...galleryUi}>
      <For each={tools}>
        {(tool, index) => (
          <>
            <TapButton
              class={[css.tool, { [css.on!]: props.studio.tool() === tool.id }]}
              title={`${tool.label} (${keyOf(tool.id)})`}
              onTap={() => {
                props.studio.setTool(tool.id);
                props.done();
              }}
            >
              <SketchIcon name={tool.icon} size={22} />
              <Show when={props.showKeys}>
                <kbd>{keyOf(tool.id)}</kbd>
              </Show>
            </TapButton>
            <Show when={index() === 2}>
              <span class={css.toolGap} />
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}

/** A tool's key: Glass's own letters first, the gallery's otherwise. */
function keyOf(tool: ToolId) {
  const own = Object.entries(toolKeys).find(([, id]) => id === tool)?.[0];
  return own ? own.slice(3) : tools.find((entry) => entry.id === tool)!.key;
}

/**
 * View extras under the QuickMenu: fit the drawing, zoom to 100% (the button shows the zoom), flip the view and
 * symmetry, the last two blue while on. They keep the cluster open.
 */
function ViewPill(props: { studio: Studio; box: Box; center: Point }) {
  return (
    <div class={[css.card, css.view]} style={placed(props.box)} {...galleryUi}>
      <TapButton class={css.viewButton} title="Fit the drawing" onTap={() => props.studio.fit()}>
        <SketchIcon name="fullscreen" size={18} />
      </TapButton>
      <TapButton class={css.viewButton} title="Zoom to 100%" onTap={() => props.studio.zoomTo(1, props.center)}>
        {Math.round(props.studio.view().scale * 100)}%
      </TapButton>
      <TapButton
        class={[css.viewButton, { [css.on!]: props.studio.view().flipped }]}
        title="Flip the view"
        onTap={() => props.studio.flip()}
      >
        <SketchIcon name="mirror" size={18} />
      </TapButton>
      <TapButton
        class={[css.viewButton, { [css.on!]: props.studio.symmetry() }]}
        title="Symmetry"
        onTap={() => props.studio.toggleSymmetry()}
      >
        <SketchIcon name="symmetry" size={18} />
      </TapButton>
    </div>
  );
}

/**
 * The brush at its real size on screen, at the QuickMenu's center, while size or opacity change: filled with the
 * color at the brush's opacity and softness (an outline for the eraser), with the value beneath.
 */
function BrushPreview(props: { studio: Studio; kind: 'size' | 'opacity' }) {
  const has = (key: string) => props.studio.settings().some((setting) => setting.key === key);
  const diameter = () => Math.min(2400, Math.max(3, props.studio.number('size') * props.studio.view().scale));
  const hardness = () => (has('hardness') ? props.studio.number('hardness') : 100);
  const erasing = () => props.studio.tool() === 'eraser';
  const label = () =>
    props.kind === 'size'
      ? `${formatValue(props.studio.number('size'))} px`
      : `${Math.round(props.studio.number('opacity'))}% opacity`;

  return (
    <>
      <Show when={has('size')}>
        <span
          class={css.preview}
          style={{
            width: `${diameter()}px`,
            height: `${diameter()}px`,
            opacity: has('opacity') && !erasing() ? props.studio.number('opacity') / 100 : 1,
            background: erasing()
              ? 'rgb(255 255 255 / 0.12)'
              : `radial-gradient(circle closest-side, ${props.studio.color()} ${Math.min(98, hardness())}%, transparent 100%)`
          }}
        />
        <span
          class={[css.preview, css.previewOutline]}
          style={{ width: `${diameter()}px`, height: `${diameter()}px` }}
        />
      </Show>
      <span class={css.previewLabel} style={{ top: `${Math.min(140, diameter() / 2 + 22)}px` }}>
        {label()}
      </span>
    </>
  );
}
