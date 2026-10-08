import { createEventListener } from '@solid-primitives/event-listener';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { presets, tools } from '../../kit/catalog';
import { blendModes, type Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { navigationDrag } from '../../kit/navigationDrag';
import { pressHandlers } from '../../kit/pressHandlers';
import { stepPreset, type NumberSetting } from '../../kit/values';
import { galleryUi, type Summon, type VariantProps } from '../../kit/variant';
import { Caption, createCaption } from './Caption';
import { ColorCore, ColorHistory } from './ColorCore';
import {
  arcPath,
  clamp,
  crescentHeight,
  crescentReach,
  disc,
  polar,
  presetAngle,
  reach,
  satellites,
  toolArc
} from './geometry';
import { LayerCrescent } from './LayerCrescent';
import { Orb } from './Orb';
import styles from './Orbit.module.css';
import { PresetRing } from './PresetRing';
import { RotationRim } from './RotationRim';
import { SettingArcs } from './SettingArcs';
import { tapPress } from './tapPress';

/**
 * Orbit, after Krita's pop-up palette grown into the whole UI: one disc under the pen with the color selector at its
 * center, recent colors around it, a ring of brush presets and the canvas rotation rim; tools, view functions,
 * settings arcs and a crescent of layers hug it from outside. The layers' fold state and the settings page last for
 * the variant's lifetime; everything else opens fresh.
 */
export function OrbitVariant(props: VariantProps) {
  const [layersOpen, setLayersOpen] = createSignal(true);
  const [page, setPage] = createSignal(0);

  return (
    <Show when={props.summon}>
      {(summon) => (
        <Orbit
          studio={props.studio}
          summon={summon()}
          hand={props.hand}
          hidden={props.hidden}
          close={props.close}
          done={props.done}
          layersOpen={layersOpen()}
          setLayersOpen={setLayersOpen}
          page={page()}
          setPage={setPage}
        />
      )}
    </Show>
  );
}

/**
 * The open Orbit, centered on the summoning point and shifted (or, on a tiny window, scaled) to stay inside the
 * window. Owns the keyboard (`,` `.` presets, ← → rotation, 1–8 tools, Tab settings page, Esc) and the wheel over
 * its parts, which each declare what the wheel does with `data-wheel`. Navigation drags (Pan, Zoom, the rim) hide
 * everything but the control in use.
 */
function Orbit(props: {
  studio: Studio;
  summon: Summon;
  hand: 'left' | 'right';
  hidden: boolean;
  close: () => void;
  done: () => void;
  layersOpen: boolean;
  setLayersOpen: (open: boolean) => void;
  page: number;
  setPage: (page: number) => void;
}) {
  const windowSize = createWindowSize();
  const captions = createCaption();
  const navigation = navigationDrag(props.studio);
  const [nav, setNav] = createSignal<'pan' | 'zoom' | 'rotate'>();
  /** The last input over the Orbit; hover effects are for pens and mice only (touch leaves them stuck). */
  const [input, setInput] = createSignal<string>(() => props.summon.pointerType);
  const side = (): 1 | -1 => (props.hand === 'left' ? 1 : -1);
  const place = (angle: number, radius: number) => polar(side() * angle, radius);
  const frame = createMemo(() => {
    const far = props.layersOpen ? crescentReach : reach.folded;
    const left = side() > 0 ? reach.hand : far;
    const right = side() > 0 ? far : reach.hand;
    const panel = props.layersOpen ? crescentHeight(Math.max(5, props.studio.layers().length) + 3) / 2 : 0;
    const vertical = Math.max(reach.vertical, panel + 4);
    const { width, height } = windowSize;
    const scale = Math.min(1, (width - margin * 2) / (left + right), (height - topMargin - margin) / (vertical * 2));
    return {
      x: clamp(props.summon.at.x, margin + left * scale, width - margin - right * scale),
      y: clamp(props.summon.at.y, topMargin + vertical * scale, height - margin - vertical * scale),
      scale
    };
  });
  const toLocal = (client: Point): Point => {
    const { x, y, scale } = frame();
    return { x: (client.x - x) / scale, y: (client.y - y) / scale };
  };
  const endNav = () => {
    navigation.end();
    setNav(undefined);
  };
  /** Press-drag navigation from the Pan and Zoom orbs; a tap on Zoom sets 100 %. Zoom pivots on the summoning point. */
  const navPress = (kind: 'pan' | 'zoom') =>
    pressHandlers({
      start: (press) => navigation.start(kind, press.point, kind === 'zoom' ? props.summon.at : undefined),
      move: (press) => {
        if (press.moved) {
          setNav(kind);
        }

        navigation.move(press.point, press.shift);
      },
      end: endNav,
      cancel: endNav,
      tap: () => {
        endNav();
        if (kind === 'zoom') {
          props.studio.zoomTo(1, props.summon.at);
          props.studio.notify('Zoom 100 %');
        } else {
          props.studio.notify('Pan: press and drag');
        }
      }
    });
  // Press handlers keep their press in a closure: create them once, never inside a JSX expression.
  const panPress = navPress('pan');
  const zoomPress = navPress('zoom');
  const undoPress = tapPress(() => props.studio.undo());
  const redoPress = tapPress(() => props.studio.redo());
  const fitPress = tapPress(() => props.studio.fit());
  const flipPress = tapPress(() => props.studio.flip());
  const symmetryPress = tapPress(() => props.studio.toggleSymmetry());
  const layersPress = tapPress(() => props.setLayersOpen(!props.layersOpen));
  const wheelSteps = createWheelSteps();
  const statusPath = createUniqueId();
  /** The tool, and the preset when it belongs to that tool, for the line along the rim. */
  const status = () => {
    const preset = presets.find((entry) => entry.id === props.studio.preset());
    const tool = props.studio.toolInfo().label;
    return (preset?.tool === props.studio.tool() ? `${tool} · ${preset.name}` : tool).toUpperCase();
  };
  let root!: HTMLDivElement;

  createEventListener(window, 'keydown', onKey, { capture: true });
  createEventListener(window, 'wheel', onWheel, { passive: false, capture: true });

  return (
    <div
      ref={root}
      class={styles.root}
      {...galleryUi}
      data-nav={nav()}
      data-input={input()}
      onPointerDown={(event) => setInput(event.pointerType)}
      onPointerMove={(event) => setInput(event.pointerType)}
      style={{
        left: `${frame().x}px`,
        top: `${frame().y}px`,
        transform: frame().scale < 1 ? `scale(${frame().scale})` : undefined,
        visibility: props.hidden ? 'hidden' : undefined
      }}
    >
      <div class={styles.stage}>
        <svg class={styles.scene} viewBox="-560 -380 1120 760" aria-hidden="true">
          <g data-part="ui">
            <circle class={styles.discBody} {...galleryUi} r={disc.radius} />
            <circle class={styles.groove} r={disc.presets} stroke-width={disc.slot + 10} />
            <circle class={styles.rimEdge} r={disc.rimInner} />
          </g>
          <RotationRim studio={props.studio} toLocal={toLocal} onRotating={(on) => setNav(on ? 'rotate' : undefined)} />
          {/* What the pen holds, along the bottom of the rim, as Krita names the brush in its pop-up. */}
          <g data-part="ui">
            <path id={statusPath} d={arcPath(disc.rimInner + 8, 240, 120)} fill="none" />
            <text class={styles.status} text-anchor="middle" dominant-baseline="central">
              <textPath href={`#${statusPath}`} startOffset="50%">
                {status()}
              </textPath>
            </text>
          </g>
          <SettingArcs
            studio={props.studio}
            side={side()}
            page={props.page}
            setPage={props.setPage}
            toLocal={toLocal}
          />
        </svg>

        <ColorCore studio={props.studio} />
        <ColorHistory studio={props.studio} side={side()} done={props.done} />
        <PresetRing studio={props.studio} captions={captions} done={props.done} />

        <For each={tools} keyed={false}>
          {(tool, index) => {
            const angle = () => side() * (toolArc.first + index * toolArc.step);
            const badge = () => polar(angle(), 21);
            const owner = `tool-${index}`;
            const press = tapPress(() => {
              props.studio.setTool(tool().id);
              props.done();
            });
            return (
              <Orb
                at={polar(angle(), toolArc.radius)}
                icon={tool().icon}
                label={`${tool().label} (${index + 1})`}
                active={props.studio.tool() === tool().id}
                press={press}
                onHover={(on) =>
                  on
                    ? captions.show(owner, tool().label, polar(angle(), disc.track), `${index + 1}`)
                    : captions.hide(owner)
                }
              >
                <span
                  class={styles.badge}
                  style={{ left: `calc(50% + ${badge().x}px)`, top: `calc(50% + ${badge().y}px)` }}
                >
                  {index + 1}
                </span>
              </Orb>
            );
          }}
        </For>

        <Orb
          at={place(satellites.undo.angle, satellites.undo.radius)}
          icon="undo"
          label="Undo (Ctrl+Z)"
          disabled={!props.studio.canUndo()}
          press={undoPress}
        />
        <Orb
          at={place(satellites.fit.angle, satellites.fit.radius)}
          size={32}
          icon="fullscreen"
          label="Fit the drawing"
          press={fitPress}
        />
        <Orb
          at={place(satellites.redo.angle, satellites.redo.radius)}
          icon="redo"
          label="Redo (Ctrl+Shift+Z)"
          disabled={!props.studio.canRedo()}
          press={redoPress}
        />
        <Orb
          at={place(satellites.pan.angle, satellites.pan.radius)}
          icon="pan"
          label="Pan: press and drag"
          part="pan"
          active={nav() === 'pan'}
          press={panPress}
        />
        <Orb
          at={place(satellites.flip.angle, satellites.flip.radius)}
          size={32}
          icon="mirror"
          label="Flip the view"
          active={props.studio.view().flipped}
          press={flipPress}
        />
        <Orb
          at={place(satellites.symmetry.angle, satellites.symmetry.radius)}
          size={32}
          icon="symmetry"
          label="Mirror strokes (symmetry)"
          active={props.studio.symmetry()}
          press={symmetryPress}
        />
        <Orb
          at={place(satellites.zoom.angle, satellites.zoom.radius)}
          icon="zoom"
          label="Zoom: drag up or down; tap for 100 %"
          part="zoom"
          active={nav() === 'zoom'}
          press={zoomPress}
        >
          <Show when={nav() === 'zoom'}>
            <span class={styles.readout}>{`${Math.round(props.studio.view().scale * 100)} %`}</span>
          </Show>
        </Orb>
        <Orb
          at={place(satellites.layers.angle, satellites.layers.radius)}
          size={30}
          icon="layers"
          label={props.layersOpen ? 'Fold the layers' : 'Layers'}
          active={props.layersOpen}
          press={layersPress}
        />

        <Show when={props.layersOpen}>
          <LayerCrescent studio={props.studio} side={side()} done={props.done} />
        </Show>

        <Caption captions={captions} />
      </div>
    </div>
  );

  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === ',' || event.key === '.') {
      cyclePreset(event.key === '.' ? 1 : -1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      stepRotation(event.key === 'ArrowRight' ? 1 : -1);
    } else if (/^Digit[1-8]$/.test(event.code)) {
      props.studio.setTool(tools[Number(event.code.slice(5)) - 1]!.id);
      props.done();
    } else if (event.key === 'Tab') {
      props.setPage((props.page + 1) % pageCount());
    } else if (event.key === 'Escape') {
      props.close();
    } else {
      return;
    }

    event.preventDefault();
  }

  /** The wheel over the Orbit never reaches the page (no browser zoom); over a part it does what the part declares. */
  function onWheel(event: WheelEvent) {
    if (!(event.target instanceof Element) || !root.contains(event.target)) {
      return;
    }

    event.preventDefault();
    const zone = event.target.closest<HTMLElement | SVGElement>('[data-wheel]');
    const kind = zone?.dataset.wheel;
    const key = zone?.dataset.key;
    const steps = kind ? wheelSteps(event, `${kind}:${key ?? ''}`) : 0;
    if (!kind || steps === 0) {
      return;
    }

    const studio = props.studio;
    if (kind === 'rim') {
      studio.rotateBy(5 * steps);
    } else if (kind === 'presets') {
      cyclePreset(steps);
    } else if (kind === 'gauge' && key) {
      const setting = studio
        .settings()
        .find((entry): entry is NumberSetting => entry.key === key && entry.kind === 'number');
      if (setting) {
        studio.setValue(key, stepPreset(setting, studio.number(key), -steps));
      }
    } else if (kind === 'choice' && key) {
      const setting = studio.settings().find((entry) => entry.key === key);
      if (setting?.kind === 'choice') {
        const index = setting.options.indexOf(String(studio.value(key)));
        studio.setValue(key, setting.options[cycle(index + steps, setting.options.length)]!);
      }
    } else if (kind === 'opacity') {
      const layer = studio.layers().find((entry) => entry.id === studio.activeLayer());
      if (layer) {
        studio.updateLayer(layer.id, { opacity: clamp(Math.round(layer.opacity / 5) * 5 - steps * 5, 0, 100) });
      }
    } else if (kind === 'blend') {
      const layer = studio.layers().find((entry) => entry.id === studio.activeLayer());
      if (layer) {
        studio.updateLayer(layer.id, {
          blend: blendModes[cycle(blendModes.indexOf(layer.blend) + steps, blendModes.length)]!
        });
      }
    }
  }

  /** Applies the preset `by` places along the ring (wrapping) and names it on the rim for a moment. */
  function cyclePreset(by: number) {
    const index = presets.findIndex((preset) => preset.id === props.studio.preset());
    const next = index < 0 ? (by > 0 ? 0 : presets.length - 1) : cycle(index + by, presets.length);
    props.studio.choosePreset(presets[next]!.id);
    captions.flash('preset-key', presets[next]!.name, polar(presetAngle(next), disc.track), ', .');
  }

  /** Turns the canvas to the next 15° stop clockwise (`by` 1) or counter-clockwise (-1). */
  function stepRotation(by: 1 | -1) {
    const angle = props.studio.view().angle;
    const stops = angle / 15;
    props.studio.rotateTo(by > 0 ? (Math.floor(stops + 1e-6) + 1) * 15 : (Math.ceil(stops - 1e-6) - 1) * 15);
  }

  function pageCount() {
    return Math.max(1, Math.ceil(props.studio.settings().filter((setting) => setting.kind === 'number').length / 4));
  }
}

/** Space kept clear around the Orbit, and below the gallery's bar at the top. */
const margin = 8;
const topMargin = 50;

/**
 * Turns wheel events into whole notches for one zone at a time: a mouse wheel's notch (|delta| ≥ 50 px) is one step;
 * a trackpad's small deltas add up until they make one. Switching zones starts over.
 */
function createWheelSteps() {
  let zone = '';
  let rest = 0;

  return (event: WheelEvent, at: string) => {
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    const delta = (event.deltaY || event.deltaX) * unit;
    if (at !== zone) {
      zone = at;
      rest = 0;
    }

    if (Math.abs(delta) >= 50) {
      rest = 0;
      return Math.sign(delta);
    }

    rest += delta;
    if (Math.abs(rest) < 60) {
      return 0;
    }

    const step = Math.sign(rest);
    rest = 0;
    return step;
  };
}

/** `index` wrapped into `[0, length)`. */
function cycle(index: number, length: number) {
  return ((index % length) + length) % length;
}
