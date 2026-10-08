import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, For } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { blendLabel, blendModes, type BlendMode, type Layer, type LayerId } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import { doubleTapTime, opacityDial, wheelNotch } from './dials';
import styles from './Mixer.module.css';
import { tapHandlers } from './tapHandlers';

/**
 * Layers as a mixing console: one channel strip per layer, top layer first (channel 1). Each strip has its blend
 * mode stepper, a live thumbnail and name (tap to select; drag sideways to scroll the strips), Mute (hide) and Solo
 * (show only this layer; again restores), Lock, and a long opacity fader. The buttons at the end of the row add,
 * duplicate, delete and move the selected layer. More channels than fit scroll sideways.
 */
export function Mixer(props: {
  studio: Studio;
  solo: Solo;
  /** Whether the arrow keys turn the selected channel's fader. */
  faderCursor: boolean;
  /** A fader was touched: the arrow keys should turn the selected channel's fader. */
  onFader: () => void;
}) {
  const [scroller, setScroller] = createSignal<HTMLDivElement>();
  const [scroll, setScroll] = createSignal({ start: 0, size: 1 });
  const updateScroll = (element: HTMLElement) =>
    setScroll({
      start: element.scrollLeft / Math.max(1, element.scrollWidth),
      size: element.clientWidth / Math.max(1, element.scrollWidth)
    });

  createResizeObserver(scroller, (_rect, element) => updateScroll(element));
  createEventListener(scroller, 'scroll', (event) => updateScroll(event.currentTarget as HTMLElement), {
    passive: true
  });
  // Keeps the selected channel in view, also after adding a layer or selecting one from the keyboard.
  createEffect(
    () => ({ id: props.studio.activeLayer(), count: props.studio.layers().length, element: scroller() }),
    ({ id, element }) => {
      const channel = element?.querySelector<HTMLElement>(`[data-layer="${CSS.escape(id)}"]`);
      if (!element || !channel) {
        return;
      }

      if (channel.offsetLeft < element.scrollLeft) {
        element.scrollLeft = channel.offsetLeft;
      } else if (channel.offsetLeft + channel.offsetWidth > element.scrollLeft + element.clientWidth) {
        element.scrollLeft = channel.offsetLeft + channel.offsetWidth - element.clientWidth;
      }

      updateScroll(element);
    }
  );

  const tail: { icon: SketchIconName; label: string; run: () => void }[] = [
    { icon: 'newLayer', label: 'New', run: () => props.studio.addLayer() },
    { icon: 'copy', label: 'Dup', run: () => props.studio.duplicateLayer() },
    { icon: 'trash', label: 'Del', run: () => props.studio.deleteLayer() },
    { icon: 'left', label: 'Up', run: () => props.studio.moveLayer('up') },
    { icon: 'right', label: 'Down', run: () => props.studio.moveLayer('down') }
  ];

  return (
    <section class={styles.mixer}>
      <header class={styles.silk}>
        <span>Layers</span>
        <span class={styles.keys}>Tab · H mute · J solo · K lock · N new</span>
      </header>
      <div class={styles.row}>
        <div
          class={styles.strips}
          ref={setScroller}
          onWheel={(event) => {
            const element = scroller();
            if (element) {
              event.preventDefault();
              element.scrollLeft += event.deltaX || event.deltaY;
            }
          }}
        >
          <For each={props.studio.layers()} keyed={(layer) => layer.id}>
            {(layer, index) => (
              <Channel
                studio={props.studio}
                layer={layer()}
                number={index() + 1}
                selected={props.studio.activeLayer() === layer().id}
                soloed={props.solo.soloed() === layer().id}
                faderCursor={props.faderCursor && props.studio.activeLayer() === layer().id}
                solo={props.solo}
                scroller={scroller()}
                onFader={props.onFader}
              />
            )}
          </For>
        </div>
        <div class={styles.tail}>
          {tail.map((button) => (
            <button class={styles.tailButton} {...galleryUi} {...tapHandlers(button.run)} aria-label={button.label}>
              <SketchIcon name={button.icon} size={16} />
              <span>{button.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div class={styles.scrollbar} style={{ opacity: scroll().size < 0.999 ? 1 : 0 }}>
        <i style={{ left: `${scroll().start * 100}%`, width: `${scroll().size * 100}%` }} />
      </div>
    </section>
  );
}

/** One channel strip. Its fader is a separate component so that its press keeps a stable element. */
function Channel(props: {
  studio: Studio;
  layer: Layer;
  number: number;
  selected: boolean;
  soloed: boolean;
  faderCursor: boolean;
  solo: Solo;
  scroller: HTMLDivElement | undefined;
  onFader: () => void;
}) {
  const id = () => props.layer.id;
  // Tap selects the layer; a sideways drag scrolls the strips, as fingers expect of a row of channels.
  const head = pressHandlers({
    move(press) {
      if (props.scroller && press.moved) {
        props.scroller.scrollLeft -= press.delta.x;
      }
    },
    tap: () => props.studio.selectLayer(id()),
    end: () => {}
  });
  const stepBlend = (by: number) => {
    const index = blendModes.indexOf(props.layer.blend);
    const next = blendModes[(index + by + blendModes.length) % blendModes.length]!;
    props.studio.updateLayer(id(), { blend: next });
  };
  let blendWheel = 0;

  return (
    <div class={[styles.channel, { [styles.selected!]: props.selected }]} data-layer={props.layer.id}>
      <div
        class={styles.blend}
        title={blendLabel(props.layer.blend)}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          blendWheel += event.deltaY || event.deltaX;
          if (Math.abs(blendWheel) >= wheelNotch) {
            stepBlend(blendWheel < 0 ? -1 : 1);
            blendWheel = 0;
          }
        }}
      >
        <button {...galleryUi} {...tapHandlers(() => stepBlend(-1))} aria-label="Previous blend mode">
          ‹
        </button>
        <span>{blendShort[props.layer.blend]}</span>
        <button {...galleryUi} {...tapHandlers(() => stepBlend(1))} aria-label="Next blend mode">
          ›
        </button>
      </div>

      <div class={styles.head} {...galleryUi} {...head}>
        <span class={styles.number}>{props.number}</span>
        <LayerThumb studio={props.studio} layer={props.layer.id} width={52} height={36} class={styles.thumb} />
        <span class={styles.name}>{props.layer.name}</span>
      </div>

      <div class={styles.buttons}>
        <button
          class={[styles.small, { [styles.on!]: !props.layer.visible }]}
          {...galleryUi}
          {...tapHandlers(() => toggleMute(props.studio, props.solo, props.layer))}
          aria-label="Mute: hide the layer"
        >
          M
        </button>
        <button
          class={[styles.small, { [styles.on!]: props.soloed }]}
          {...galleryUi}
          {...tapHandlers(() => props.solo.toggle(id()))}
          aria-label="Solo: show only this layer"
        >
          S
        </button>
      </div>
      <button
        class={[styles.lock, { [styles.on!]: props.layer.locked }]}
        {...galleryUi}
        {...tapHandlers(() => props.studio.updateLayer(id(), { locked: !props.layer.locked }))}
        aria-label="Lock"
      >
        <SketchIcon name={props.layer.locked ? 'lock' : 'unlock'} size={13} />
      </button>

      <span class={styles.level}>{props.layer.opacity}</span>
      <Fader studio={props.studio} layer={props.layer} cursor={props.faderCursor} onTouch={props.onFader} />
    </div>
  );
}

/**
 * A long-throw opacity fader. Pressing the cap grabs it where it was pressed; pressing the track elsewhere jumps the
 * cap there; dragging moves it (Shift: five times finer). Double tap: 100 %. The wheel steps 5 % (Shift: 1 %).
 */
function Fader(props: { studio: Studio; layer: Layer; cursor: boolean; onTouch: () => void }) {
  const dial = opacityDial(props.studio, () => props.layer.id);
  let geometry = { top: 0, span: 1 };
  let grab = 0;
  let exact = 0;
  let lastTap = -Infinity;
  let wheel = 0;
  const set = (opacity: number) => {
    exact = Math.min(100, Math.max(0, opacity));
    props.studio.updateLayer(props.layer.id, { opacity: Math.round(exact) });
  };
  const at = (y: number) => (1 - (y - geometry.top) / geometry.span) * 100;
  const handlers = pressHandlers({
    start(press) {
      if (props.layer.id === props.studio.activeLayer()) {
        props.onTouch();
      }

      const rect = press.target.getBoundingClientRect();
      geometry = { top: rect.top + faderInset + capHeight / 2, span: rect.height - faderInset * 2 - capHeight };
      const cap = geometry.top + (1 - props.layer.opacity / 100) * geometry.span;
      exact = props.layer.opacity;
      if (Math.abs(press.point.y - cap) <= capHeight / 2 + 3) {
        grab = press.point.y - cap;
        return;
      }

      grab = 0;
      set(at(press.point.y));
    },
    move(press) {
      if (press.shift) {
        set(exact - (press.delta.y / geometry.span) * 20);
        return;
      }

      set(at(press.point.y - grab));
    },
    end: () => {},
    tap(_press, event) {
      if (event.timeStamp - lastTap < doubleTapTime) {
        set(100);
        lastTap = -Infinity;
        return;
      }

      lastTap = event.timeStamp;
    }
  });

  return (
    <div
      class={[styles.fader, { [styles.cursor!]: props.cursor }]}
      style={{ '--level': `${props.layer.opacity / 100}` }}
      {...galleryUi}
      {...handlers}
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        wheel += event.deltaY || event.deltaX;
        if (Math.abs(wheel) >= wheelNotch) {
          dial.step(wheel < 0 ? 1 : -1, event.shiftKey);
          wheel = 0;
        }
      }}
      aria-label={`Opacity ${props.layer.opacity} %`}
    >
      <i class={styles.scale} />
      <i class={styles.slot} />
      <i class={styles.cap} />
    </div>
  );
}

/** Top and bottom padding inside a fader's well, and its cap's height, in CSS pixels; the CSS matches. */
const faderInset = 6;
const capHeight = 20;

/**
 * Solo for the mixer: soloing a layer shows only it and remembers every layer's visibility; soloing it again
 * restores them. Soloing another layer moves the solo and keeps the remembered state. A manual Mute during a solo
 * ends it where it stands (`release`), so that a later restore cannot undo what the user just did.
 */
export function createSolo(studio: Studio) {
  const [soloed, setSoloed] = createSignal<LayerId>();
  let saved: Map<LayerId, boolean> | undefined;

  return {
    /** The soloed layer, if any. */
    soloed,
    toggle(id: LayerId) {
      const layers = studio.layers();
      if (soloed() === id) {
        for (const layer of layers) {
          studio.updateLayer(layer.id, { visible: saved?.get(layer.id) ?? layer.visible });
        }

        saved = undefined;
        setSoloed(undefined);
        return;
      }

      saved ??= new Map(layers.map((layer) => [layer.id, layer.visible]));
      for (const layer of layers) {
        studio.updateLayer(layer.id, { visible: layer.id === id });
      }

      setSoloed(id);
    },
    release() {
      saved = undefined;
      setSoloed(undefined);
    }
  };
}

/** The mixer's solo state, as `createSolo` returns it. */
export type Solo = ReturnType<typeof createSolo>;

/** Mute: hides or shows a layer; during a solo, ends the solo first. */
export function toggleMute(studio: Studio, solo: Solo, layer: Layer) {
  solo.release();
  studio.updateLayer(layer.id, { visible: !layer.visible });
}

/** Four-letter blend mode names for the channel's small screen, as console scribble strips abbreviate. */
const blendShort: Record<BlendMode, string> = {
  normal: 'NORM',
  darken: 'DARK',
  multiply: 'MULT',
  'color-burn': 'BURN',
  lighten: 'LITE',
  screen: 'SCRN',
  'color-dodge': 'DODG',
  overlay: 'OVLY',
  'soft-light': 'SOFT',
  'hard-light': 'HARD',
  difference: 'DIFF',
  hue: 'HUE',
  saturation: 'SAT',
  color: 'COLR',
  luminosity: 'LUM'
};
