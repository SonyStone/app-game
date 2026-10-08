import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js';
import { presets, type Setting, type SettingValue } from '../../kit/catalog';
import type { Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers } from '../../kit/pressHandlers';
import { StrokePreview } from '../../kit/StrokePreview';
import { fractionOf } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import { modes, type DialModel, type Track } from './createDialModel';
import styles from './Dial.module.css';
import { angleOf, arcPath, polar, sectorPath, ticksPath, turnBetween } from './geometry';
import { Glyph, type GlyphName } from './Glyph';
import { makeWheelSteps, tapHandlers } from './input';
import { dialRadius } from './layout';

/**
 * The big dial, after the Surface Dial's on-screen menu and the iPod's click wheel: mode icons on the rim, a detented
 * track inside it and the readout in the hub.
 *
 * - A press-drag anywhere outside the hub turns the current mode by the angle swept around the center; the knob's
 *   fine ticks follow the pointer and settle on detents, and each detent pulses the indicator.
 * - A tap on a mode icon switches to it; a tap on the track steps once toward that side (left back, right on); a
 *   tap on the hub steps to the next mode, a press-drag on the hub pans the drawing.
 * - The wheel over the dial turns it by detents. The chip at the bottom of the track is the mode's own press: hide
 *   the layer, fit the zoom, straighten the view, or finish.
 */
export function Dial(props: {
  studio: Studio;
  model: DialModel;
  /** The dial's center in client pixels. */
  center: Point;
  /** Whether finishing closes the variant (a toggled one), so that the chip offers a check mark. */
  finishable: boolean;
  /** Shows key hints, for openings by mouse or keyboard. */
  hints: boolean;
  /** Navigation through the dial in progress: panning by the hub or turning the zoom or rotation. */
  navigating: 'pan' | 'view' | undefined;
  /** Called as navigation through the dial starts and ends (`undefined`), so that the cluster can step aside. */
  onNavigate: (kind: 'pan' | 'view' | undefined) => void;
  /** The chip's check mark: the user is done. */
  onDone: () => void;
}) {
  let face: SVGSVGElement | undefined;
  let flash: SVGCircleElement | undefined;
  let knob: SVGGElement | undefined;
  const [adjusting, setAdjusting] = createSignal(false);
  let adjustTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(adjustTimer));
  const wheelSteps = makeWheelSteps();

  const track = () => props.model.track();
  const readout = () => props.model.readout();
  const indicator = () => {
    const at = track().at;
    return at === undefined ? undefined : trackAngle(track(), at);
  };
  const modeIndex = () => modes.findIndex((entry) => entry.id === props.model.mode());
  const footprint = () => {
    if (props.model.mode() !== 'size' || !props.model.modeSetting()) {
      return undefined;
    }

    const diameter = props.studio.number('size') * props.studio.view().scale;
    return diameter > 30 && diameter < dialRadius * 2 - 8 ? diameter : undefined;
  };

  createEffect(
    () => props.model.feedback(),
    (event, previous) => {
      if (!previous) {
        return;
      }

      if (event.kind === 'tick') {
        flash?.animate(
          [
            { opacity: 0.95, transform: 'scale(0.5)' },
            { opacity: 0, transform: 'scale(2.6)' }
          ],
          { duration: 170, easing: 'ease-out' }
        );
        knob?.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 150, easing: 'ease-out' });
      } else {
        face?.animate(
          [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(1.8deg)' },
            { transform: 'rotate(-1.2deg)' },
            { transform: 'rotate(0deg)' }
          ],
          { duration: 150, easing: 'ease-out' }
        );
      }

      setAdjusting(true);
      clearTimeout(adjustTimer);
      adjustTimer = setTimeout(() => setAdjusting(false), 900);
    }
  );

  /** What the press on the dial grabbed: the hub pans, the rest turns. */
  let grab: 'hub' | 'ring' = 'ring';
  let lastAngle = 0;
  let engaged = false;
  const finish = () => {
    if (engaged && grab === 'ring') {
      props.model.turnEnd();
    }

    if (engaged) {
      props.onNavigate(undefined);
    }

    engaged = false;
  };
  const press = pressHandlers({
    start(started) {
      grab = distance(started.start) < ring.hub ? 'hub' : 'ring';
      lastAngle = angleOf(started.start, props.center);
      engaged = false;
    },
    move(moving) {
      if (!moving.moved) {
        return;
      }

      if (grab === 'hub') {
        if (engaged) {
          props.studio.pan(moving.delta.x, moving.delta.y);
        } else {
          engaged = true;
          props.onNavigate('pan');
          props.studio.pan(moving.point.x - moving.start.x, moving.point.y - moving.start.y);
        }

        return;
      }

      if (!engaged) {
        engaged = true;
        props.model.turnStart(props.center);
        if (props.model.continuous()) {
          props.onNavigate('view');
        }
      }

      const angle = angleOf(moving.point, props.center);
      // Right over the center the angle jumps about; the turn waits until the pointer is out again.
      if (distance(moving.point) > 18) {
        props.model.turnBy(turnBetween(lastAngle, angle));
      }

      lastAngle = angle;
    },
    end: finish,
    cancel: finish,
    tap(tapped) {
      const local = { x: tapped.start.x - props.center.x, y: tapped.start.y - props.center.y };
      const radius = Math.hypot(local.x, local.y);
      if (radius < ring.hub) {
        props.model.stepMode(1);
        return;
      }

      if (radius >= ring.modeInner - 3) {
        const slot = Math.round(angleOf(tapped.start, props.center) / 36) % modes.length;
        const chosen = modes[slot]!;
        if (props.model.available(chosen.id)) {
          props.model.setMode(chosen.id);
        }

        return;
      }

      props.model.step(local.x < 0 ? -1 : 1, props.center);
    }
  });
  const chipPress = tapHandlers(() => runChip());
  const chip = (): { icon: GlyphName; title: string } | undefined => {
    switch (props.model.mode()) {
      case 'layer': {
        const layer = props.studio.layers().find((entry) => entry.id === props.studio.activeLayer());
        return { icon: layer?.visible === false ? 'hidden' : 'eye', title: 'Show or hide the layer' };
      }
      case 'zoom':
        return { icon: 'fit', title: 'Fit the drawing' };
      case 'rotate':
        return { icon: 'reset', title: 'Straighten the view (0°)' };
      default:
        return props.finishable ? { icon: 'check', title: 'Done' } : undefined;
    }
  };

  return (
    <div
      {...galleryUi}
      {...press}
      class={[
        styles.dial,
        { [styles.ghostPan!]: props.navigating === 'pan', [styles.ghostView!]: props.navigating === 'view' }
      ]}
      style={{
        left: `${props.center.x - dialRadius}px`,
        top: `${props.center.y - dialRadius}px`,
        width: `${dialRadius * 2}px`,
        height: `${dialRadius * 2}px`
      }}
      onWheel={(event) => {
        event.preventDefault();
        props.model.step(wheelSteps(event), props.center);
      }}
    >
      <svg
        ref={face}
        class={styles.face}
        viewBox={`${-dialRadius} ${-dialRadius} ${dialRadius * 2} ${dialRadius * 2}`}
        width={dialRadius * 2}
        height={dialRadius * 2}
        aria-hidden="true"
      >
        <circle class={styles.disc} r={dialRadius - 0.5} />
        <path
          class={styles.modeSector}
          d={sectorPath(ring.modeInner, dialRadius - 1, modeIndex() * 36 - 18, modeIndex() * 36 + 18)}
        />
        <path class={styles.modeRim} d={arcPath(dialRadius - 2.5, modeIndex() * 36 - 13, modeIndex() * 36 + 13)} />
        <path class={styles.separators} d={separatorPath} />
        <circle class={styles.trackBand} r={ring.modeInner - 0.5} />
        <g ref={knob} class={styles.knob} transform={`rotate(${round(props.model.knurl())})`}>
          <path d={knobPath(props.model.mode() === 'zoom' ? 10 : props.model.detent())} />
        </g>
        <Show when={track().shape === 'arc'} fallback={<circle class={styles.rail} r={ring.rail} />}>
          <path class={styles.rail} d={arcPath(ring.rail, -135, 135)} />
        </Show>
        <For each={colorSegments(track())} keyed={false}>
          {(segment) => <path class={styles.segment} d={segment().path} stroke={segment().color} />}
        </For>
        <Show when={levelPath(track())}>{(path) => <path class={styles.level} d={path()} />}</Show>
        <path
          class={styles.ticks}
          d={ticksPath(
            track().ticks.map((entry) => trackAngle(track(), entry)),
            ring.tickInner,
            ring.tickOuter
          )}
        />
        <path
          class={styles.majors}
          d={ticksPath(
            track().majors.map((entry) => trackAngle(track(), entry)),
            ring.majorInner,
            ring.tickOuter
          )}
        />
        <Show when={indicator() !== undefined}>
          <g transform={`rotate(${round(indicator() ?? 0)})`}>
            <line class={styles.indicatorGlow} y1={-ring.indicatorInner} y2={-ring.indicatorOuter} />
            <line class={styles.indicator} y1={-ring.indicatorInner} y2={-ring.indicatorOuter} />
            <circle ref={flash} class={styles.flash} cy={-ring.rail} r={5} />
          </g>
        </Show>
        <circle class={styles.hubDisc} r={ring.hub} />
        <Show when={props.hints}>
          {modes.map((entry, index) => {
            const at = polar(ring.modeKey, index * 36);
            return (
              <text class={styles.modeKey} x={round(at.x)} y={round(at.y)}>
                {entry.key}
              </text>
            );
          })}
        </Show>
      </svg>

      {modes.map((entry, index) => {
        const at = polar(ring.modeIcon, index * 36);
        return (
          <span
            class={[
              styles.mode,
              {
                [styles.lit!]: props.model.mode() === entry.id,
                [styles.off!]: !props.model.available(entry.id)
              }
            ]}
            style={{ left: `${dialRadius + at.x - 18}px`, top: `${dialRadius + at.y - 18}px` }}
            title={`${entry.label} (${entry.key})`}
          >
            <Glyph name={entry.icon} size={18} />
          </span>
        );
      })}

      <div class={styles.hub} title="Tap: next mode · drag: pan">
        <Show
          when={props.navigating !== 'pan'}
          fallback={
            <>
              <span class={styles.label}>Pan</span>
              <div class={styles.preview}>
                <Glyph name="pan" size={24} />
              </div>
            </>
          }
        >
          <span class={styles.label}>{readout().label}</span>
          <div class={styles.preview}>
            <Preview studio={props.studio} model={props.model} />
          </div>
          <span
            class={[
              styles.value,
              { [styles.long!]: readout().value.length > 5, [styles.longer!]: readout().value.length > 10 }
            ]}
          >
            {readout().value}
            <small>{readout().unit}</small>
          </span>
          <span class={styles.note}>{readout().note}</span>
        </Show>
      </div>

      <Show when={track().shape === 'arc'}>
        <span class={styles.chevron} style={chevronStyle(208)}>
          {props.hints ? '[' : '‹'}
        </span>
        <span class={styles.chevron} style={chevronStyle(152)}>
          {props.hints ? ']' : '›'}
        </span>
      </Show>
      <Show when={chip()}>
        {(shown) => (
          <button
            {...galleryUi}
            {...chipPress}
            class={styles.chip}
            style={{ left: `${dialRadius - 15}px`, top: `${dialRadius + ring.chip - 15}px` }}
            title={shown().title}
            onPointerDown={(event) => {
              event.stopPropagation();
              chipPress.onPointerDown(event);
            }}
          >
            <Glyph name={shown().icon} size={16} />
          </button>
        )}
      </Show>

      <Show when={footprint()}>
        {(diameter) => (
          <svg
            class={[styles.footprint, { [styles.vivid!]: adjusting() }]}
            viewBox={`${-dialRadius} ${-dialRadius} ${dialRadius * 2} ${dialRadius * 2}`}
            width={dialRadius * 2}
            height={dialRadius * 2}
            aria-hidden="true"
          >
            <circle r={diameter() / 2} />
          </svg>
        )}
      </Show>
    </div>
  );

  function distance(point: Point) {
    return Math.hypot(point.x - props.center.x, point.y - props.center.y);
  }

  function runChip() {
    const { studio, model } = props;
    switch (model.mode()) {
      case 'layer': {
        const layer = studio.layers().find((entry) => entry.id === studio.activeLayer());
        if (layer) {
          studio.updateLayer(layer.id, { visible: !layer.visible });
        }

        return;
      }
      case 'zoom':
        studio.fit();
        return;
      case 'rotate':
        studio.rotateTo(0);
        return;
      default:
        props.onDone();
    }
  }
}

/**
 * The hub's live preview of what the dial turns: the brush dot at its real on-screen size (up to the hub), the
 * color swatches, the preset's stroke, the layer's thumbnail, the view's orientation.
 */
function Preview(props: { studio: Studio; model: DialModel }) {
  const mode = () => props.model.mode();
  const studio = () => props.studio;
  const preset = () => presets.find((entry) => entry.id === studio().preset());
  const tuned = () => (mode() === 'tune' ? props.model.modeSetting() : undefined);

  return (
    <Switch>
      <Match when={mode() === 'size' && props.model.modeSetting()}>
        <span
          class={[styles.dot, { [styles.eraserDot!]: studio().tool() === 'eraser' }]}
          style={{
            width: `${dotSize(studio())}px`,
            height: `${dotSize(studio())}px`,
            background: studio().tool() === 'eraser' ? 'transparent' : studio().color(),
            filter: `blur(${((100 - studio().number('hardness')) / 100) * dotSize(studio()) * 0.12}px)`
          }}
        />
      </Match>
      <Match when={mode() === 'opacity' && props.model.modeSetting()}>
        <span class={styles.checker}>
          <span style={{ background: studio().color(), opacity: studio().number('opacity') / 100 }} />
        </span>
      </Match>
      <Match when={tuned()}>
        {(setting) => <TunePreview setting={setting()} value={studio().value(setting().key)} />}
      </Match>
      <Match when={mode() === 'color'}>
        <span class={styles.swatches}>
          <span style={{ background: studio().previous() }} />
          <span style={{ background: studio().color() }} />
        </span>
      </Match>
      <Match when={mode() === 'brush' ? preset() : undefined}>
        {(shown) => (
          <span class={styles.stroke}>
            <StrokePreview preset={shown()} color={studio().color()} height={26} />
          </span>
        )}
      </Match>
      <Match when={mode() === 'tool'}>
        <Glyph name={studio().toolInfo().icon} size={24} />
      </Match>
      <Match when={mode() === 'layer' ? studio().activeLayer() : undefined}>
        {(id) => (
          <span class={styles.thumb}>
            <LayerThumb studio={studio()} layer={id()} width={44} height={30} />
          </span>
        )}
      </Match>
      <Match when={mode() === 'history'}>
        <span class={styles.history}>
          <span class={{ [styles.off!]: !studio().canUndo() }}>
            <Glyph name="undo" size={16} />
          </span>
          <span class={{ [styles.off!]: !studio().canRedo() }}>
            <Glyph name="redo" size={16} />
          </span>
        </span>
      </Match>
      <Match when={mode() === 'zoom'}>
        <span class={styles.sheet} style={{ transform: `scale(${Math.min(1.3, 0.5 + studio().view().scale)})` }} />
      </Match>
      <Match when={mode() === 'rotate'}>
        <span
          class={[styles.sheet, styles.oriented]}
          style={{
            transform: `rotate(${studio().view().angle}deg) scaleX(${studio().view().flipped ? -1 : 1})`
          }}
        />
      </Match>
    </Switch>
  );
}

/** A tool setting's preview: a level for numbers, a dot per option for choices, a switch for toggles. */
function TunePreview(props: { setting: Setting; value: SettingValue | undefined }) {
  return (
    <Switch>
      <Match when={props.setting.kind === 'number' ? props.setting : undefined}>
        {(number) => (
          <span class={styles.bar}>
            <i style={{ width: `${fractionOf(number(), Number(props.value ?? 0)) * 100}%` }} />
          </span>
        )}
      </Match>
      <Match when={props.setting.kind === 'choice' ? props.setting.options : undefined}>
        {(options) => (
          <span class={styles.options}>
            <For each={options()}>{(option) => <i class={{ [styles.on!]: option === props.value }} />}</For>
          </span>
        )}
      </Match>
      <Match when={props.setting.kind === 'toggle'}>
        <span class={[styles.switch, { [styles.on!]: props.value === true }]}>
          <i />
        </span>
      </Match>
    </Switch>
  );
}

/** The dial's radii in CSS pixels, from the rim inward. */
const ring = {
  modeInner: 89,
  modeIcon: 105.5,
  modeKey: 93.5,
  knobOuter: 87,
  knobInner: 82.5,
  tickOuter: 79,
  tickInner: 75.5,
  majorInner: 72.5,
  rail: 69,
  indicatorInner: 60,
  indicatorOuter: 81,
  hub: 56,
  chip: 72
} as const;

/** Hairlines between the mode slots. */
const separatorPath = ticksPath(
  modes.map((_, index) => index * 36 + 18),
  ring.modeInner + 4,
  dialRadius - 5
);

/** The angle on the dial of a fraction of the track: 7:30 to 4:30 for arcs, all around for circles. */
function trackAngle(track: Track, fraction: number) {
  return track.shape === 'circle' ? fraction * 360 : -135 + fraction * 270;
}

function knobPath(spacing: number) {
  const count = Math.round(360 / spacing);
  return ticksPath(
    Array.from({ length: count }, (_, index) => index * spacing),
    ring.knobInner,
    ring.knobOuter
  );
}

function levelPath(track: Track) {
  if (!track.level || track.shape !== 'arc' || track.at === undefined || track.at < 0.004) {
    return undefined;
  }

  return arcPath(ring.rail, -135, trackAngle(track, track.at));
}

function colorSegments(track: Track) {
  const colors = track.colors ?? [];
  const span = track.shape === 'circle' ? 360 : 270;
  const start = track.shape === 'circle' ? 0 : -135;
  const width = span / Math.max(1, colors.length);
  return colors.map((color, index) => ({
    color,
    // A hair of overlap hides the seams between segments.
    path: arcPath(ring.rail, start + index * width, start + (index + 1) * width + 0.6)
  }));
}

function chevronStyle(angle: number) {
  const at = polar(ring.chip, angle);
  return { left: `${dialRadius + at.x - 10}px`, top: `${dialRadius + at.y - 10}px` };
}

/** The brush dot's diameter in the hub: the real on-screen size, at most 28 px. */
function dotSize(studio: Studio) {
  return Math.max(1.5, Math.min(28, studio.number('size') * studio.view().scale));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
