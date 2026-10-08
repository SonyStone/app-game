import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver, createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, Show, untrack } from 'solid-js';
import { hexToHsv, type Hsv } from '../../../../features/color/hsv';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { presets } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import type { NumberSetting } from '../../kit/values';
import { galleryUi, type VariantProps } from '../../kit/variant';
import { ColorSection } from './ColorSection';
import { createMotion } from './createMotion';
import { choiceDial, colorDials, opacityDial, settingDial, type Dial } from './dials';
import { Encoders, softKeyCodes, softSettings, stepSoft } from './Encoders';
import { createSolo, Mixer, toggleMute } from './Mixer';
import { createPads, padCodes, PadGrid } from './PadGrid';
import styles from './PadsVariant.module.css';
import { pageOf, PresetBank, presetKeyCodes, presetsPerPage, turnPage } from './PresetBank';
import { tapHandlers } from './tapHandlers';

/**
 * Pads: the cluster as a piece of studio gear drawn flat, after Ableton Push, the Akai MPC and mixing consoles.
 * A 4×4 pad grid sits under the pen (navigation, the eight tools, history and view toggles), with eight encoders and
 * a screen above it for the tool's numbers, a color section of colored pads on the hand's side, layers as a mixer
 * on the other side, and a preset bank along the bottom. Everything is playable from the keyboard, MPC style.
 *
 * Finished picks (a tool, color or preset pad) close a toggled gear unless LATCH is on; tweaks (encoders, faders,
 * mute/solo, view pads, undo/redo, layer selection) never close it, so a session of adjustments stays open.
 */
export function PadsVariant(props: VariantProps) {
  const studio = props.studio;
  const [latched, setLatched] = createSignal(false);
  const [cursor, setCursor] = createSignal('size');
  const picked = () => {
    if (!latched()) {
      props.done();
    }
  };
  const motion = createMotion(studio, () => props.summon?.at ?? { x: innerWidth / 2, y: innerHeight / 2 });
  const bank = createPads(studio, motion, picked);
  const solo = createSolo(studio);
  // Follows the color but keeps the hue (and saturation) of grays, and the dials' exact edits until it changes.
  const [hsv, setHsv] = createSignal<Hsv>((previous) => hexToHsv(studio.color(), previous));
  const hsvDials = colorDials(studio, hsv, setHsv);
  const faderDial = opacityDial(studio, () => studio.activeLayer());
  const toolDials = createMemo(() => encoderDials(studio));
  /** Every dial the arrow keys reach, in their left-to-right order: tool, color, fader. */
  const dials = () => [...toolDials().filter((dial) => dial !== undefined), ...hsvDials, faderDial];
  const cursorDial = () => dials().find((dial) => dial.id === cursor()) ?? dials()[0]!;
  const select = (dial: Dial) => setCursor(dial.id);
  const [page, setPage] = createSignal(() => pageOf(studio.preset()));

  setupKeys();

  return (
    <Show when={props.summon}>
      {(summon) => {
        const placement = createPlacement(
          () => summon().at,
          () => props.hand
        );

        return (
          <>
            <div
              ref={placement.setRoot}
              class={[styles.device, { [styles.moving!]: motion.hiding(), [styles.hidden!]: props.hidden }]}
              data-hand={props.hand}
              style={placement.style()}
              {...galleryUi}
            >
              <header class={styles.head}>
                <span class={styles.brand}>
                  Pads<small>16 · 8 · 6</small>
                </span>
                <span class={styles.mode}>{modeLabels[summon().mode]}</span>
                <button
                  class={[styles.latch, { [styles.on!]: latched() }]}
                  {...galleryUi}
                  {...tapHandlers(() => setLatched((on) => !on))}
                  title="Latch: keep the gear open after choosing a tool, color or preset"
                >
                  <i />
                  Latch<kbd>L</kbd>
                </button>
                <button class={styles.close} {...galleryUi} {...tapHandlers(() => props.close())} aria-label="Close">
                  <SketchIcon name="close" size={14} />
                </button>
              </header>

              <div class={styles.colorArea}>
                <ColorSection
                  studio={studio}
                  dials={hsvDials}
                  cursor={cursorDial().id}
                  onSelect={select}
                  onPick={picked}
                />
              </div>

              <div class={styles.center}>
                <Encoders studio={studio} dials={toolDials()} cursor={cursorDial().id} onSelect={select} />
                <PadGrid bank={bank} motion={motion} ref={placement.setPads} />
              </div>

              <div class={styles.mixerArea}>
                <Mixer
                  studio={studio}
                  solo={solo}
                  faderCursor={cursorDial().id === faderDial.id}
                  onFader={() => setCursor(faderDial.id)}
                />
              </div>

              <div class={styles.bankArea}>
                <PresetBank studio={studio} page={page()} onPage={setPage} onPick={picked} />
              </div>
            </div>

            <Show when={motion.hiding() && (motion.kind() === 'zoom' || motion.kind() === 'rotate')}>
              <span class={styles.pivot} style={{ left: `${summon().at.x}px`, top: `${summon().at.y}px` }} />
            </Show>
          </>
        );
      }}
    </Show>
  );

  /**
   * The keyboard while the gear is open, MPC keyboard mode: the pads on 1–4 / Q–R / A–F / Z–V (hold 1, 2 or 3 and
   * move the pointer to navigate), preset slots on 5–0 with − = paging, soft keys on Y U I O, ←/→ to pick an
   * encoder and ↑/↓ to turn it (Shift: fine, Backspace: reset), Tab to pick a channel, H / J / K to mute, solo and
   * lock it, N for a new layer, T to swap colors and L to latch. Consumed keys are `preventDefault`ed so the gallery
   * leaves them alone; anything with Ctrl, ⌘ or Alt passes through to it.
   */
  function setupKeys() {
    let heldCode: string | undefined;
    const stopHeld = () => {
      if (heldCode === undefined) {
        return;
      }

      heldCode = undefined;
      motion.end();
      bank.setPressed(undefined);
    };

    createEventListener(
      window,
      'keydown',
      (event) => {
        if (!props.summon || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        if (runKey(event)) {
          event.preventDefault();
        }
      },
      { capture: true }
    );
    createEventListener(
      window,
      'keyup',
      (event) => {
        if (event.code === heldCode) {
          event.preventDefault();
          stopHeld();
        }
      },
      { capture: true }
    );
    createEventListener(window, 'pointermove', (event) => {
      if (heldCode === undefined) {
        return;
      }

      if (!props.summon) {
        stopHeld();
        return;
      }

      motion.move({ x: event.clientX, y: event.clientY }, event.shiftKey, true);
    });
    createEventListener(window, 'blur', stopHeld);

    /** Runs one key; returns whether it was the gear's. */
    function runKey(event: KeyboardEvent) {
      const { code } = event;
      const pad = padCodes.indexOf(code as (typeof padCodes)[number]);
      if (pad >= 0) {
        const spec = bank.pads[pad]!;
        if (spec.motion && spec.motion !== 'history') {
          if (!event.repeat && heldCode === undefined) {
            heldCode = code;
            bank.setPressed(pad);
            motion.begin(spec.motion, props.pointer);
          }
        } else if (!event.repeat || spec.repeats) {
          bank.trigger(pad);
        }

        return true;
      }

      const slot = presetKeyCodes.indexOf(code as (typeof presetKeyCodes)[number]);
      if (slot >= 0) {
        const preset = presets[page() * presetsPerPage + slot];
        if (preset && !event.repeat) {
          studio.choosePreset(preset.id);
          picked();
        }

        return true;
      }

      const soft = softKeyCodes.indexOf(code as (typeof softKeyCodes)[number]);
      if (soft >= 0) {
        const setting = softSettings(studio)[soft];
        if (setting) {
          stepSoft(studio, setting, event.shiftKey ? -1 : 1);
        }

        return true;
      }

      const active = studio.layers().find((layer) => layer.id === studio.activeLayer());
      switch (code) {
        case 'Minus':
        case 'Equal':
          setPage(turnPage(page(), code === 'Minus' ? -1 : 1));
          return true;
        case 'ArrowLeft':
        case 'ArrowRight': {
          const list = dials();
          const index = list.indexOf(cursorDial());
          setCursor(list[(index + (code === 'ArrowRight' ? 1 : -1) + list.length) % list.length]!.id);
          return true;
        }
        case 'ArrowUp':
        case 'ArrowDown':
          cursorDial().step(code === 'ArrowUp' ? 1 : -1, event.shiftKey);
          return true;
        case 'Backspace':
        case 'Delete':
          cursorDial().reset?.();
          return true;
        case 'Tab': {
          const layers = studio.layers();
          const index = layers.findIndex((layer) => layer.id === studio.activeLayer());
          const next = layers[Math.min(layers.length - 1, Math.max(0, index + (event.shiftKey ? -1 : 1)))];
          if (next) {
            studio.selectLayer(next.id);
          }

          return true;
        }
        case 'KeyH':
          if (active) {
            toggleMute(studio, solo, active);
          }

          return true;
        case 'KeyJ':
          solo.toggle(studio.activeLayer());
          return true;
        case 'KeyK':
          if (active) {
            studio.updateLayer(active.id, { locked: !active.locked });
          }

          return true;
        case 'KeyN':
          if (!event.repeat) {
            studio.addLayer();
          }

          return true;
        case 'KeyT':
          studio.swapColors();
          return true;
        case 'KeyL':
          setLatched((on) => !on);
          return true;
        default:
          return false;
      }
    }
  }
}

/**
 * The eight encoder slots for the current tool: its numeric settings in catalog order, then its choices as detented
 * encoders, then unused slots. Toggles live only on the soft keys.
 */
function encoderDials(studio: Studio): readonly (Dial | undefined)[] {
  const assigned = [
    ...studio
      .settings()
      .filter((setting): setting is NumberSetting => setting.kind === 'number')
      .map((setting) => settingDial(studio, setting)),
    ...studio
      .settings()
      .filter((setting) => setting.kind === 'choice')
      .map((setting) => choiceDial(studio, setting))
  ];
  return Array.from({ length: 8 }, (_, slot) => assigned[slot]);
}

/**
 * Places the gear so that the center of its pad grid lands at `at`, shifted as little as needed to keep the whole
 * gear inside the window (below the gallery's bar). Measures the gear and the grid with a ResizeObserver, and again
 * when `layout` changes (the hand swaps the side sections). Hidden until the first measurement.
 */
function createPlacement(at: () => Point, layout: () => unknown) {
  const [root, setRoot] = createSignal<HTMLElement>();
  const [pads, setPads] = createSignal<HTMLElement>();
  const [frame, setFrame] = createSignal<{ width: number; height: number; padX: number; padY: number }>();
  const windowSize = createWindowSize();
  const measure = (box: HTMLElement | undefined, grid: HTMLElement | undefined) => {
    if (!box || !grid) {
      return;
    }

    const outer = box.getBoundingClientRect();
    const inner = grid.getBoundingClientRect();
    setFrame({
      width: outer.width,
      height: outer.height,
      padX: inner.left + inner.width / 2 - outer.left,
      padY: inner.top + inner.height / 2 - outer.top
    });
  };

  createResizeObserver(
    () => [root(), pads()],
    () => measure(untrack(root), untrack(pads))
  );
  createEffect(
    () => ({ layout: layout(), width: windowSize.width, height: windowSize.height, box: root(), grid: pads() }),
    ({ box, grid }) => measure(box, grid)
  );

  return {
    setRoot,
    setPads,
    /** The gear's position, as inline style. */
    style() {
      const box = frame();
      if (!box) {
        return { left: '0px', top: '0px', visibility: 'hidden' } as const;
      }

      const point = at();
      const left = within(point.x - box.padX, edge, windowSize.width - box.width - edge);
      const top = within(point.y - box.padY, topEdge, windowSize.height - box.height - edge);
      return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
    }
  };
}

/** Clamps to `[min, max]`, preferring `min` when the range is empty (the gear is larger than the window). */
function within(value: number, min: number, max: number) {
  return max < min ? min : Math.min(max, Math.max(min, value));
}

/** Margins the gear keeps from the window's edges; the top one clears the gallery's bar. */
const edge = 8;
const topEdge = 52;

const modeLabels = { hold: 'Hold', toggle: 'Toggle', pinned: 'Pinned' } as const;
