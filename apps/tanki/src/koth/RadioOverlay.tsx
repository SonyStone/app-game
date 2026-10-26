import { For, Show, untrack } from 'solid-js';
import { seatName } from './Hud';
import { useKothI18n } from './i18n/i18n';
import type { SeatHud } from './match';
import type { Lane, MarkerKind, RadioLine } from './radio';
import type { TeamId } from './rules';
import type { TankClassId } from './tanks';
import './poster.css';

/** A line on a team's radio placed on screen, from `KothMatch['callouts']`. */
export type CalloutView = {
  id: number;
  team: TeamId;
  line: RadioLine;
  /** What the line names. */
  tankClass: TankClassId | undefined;
  ally: SeatHud | undefined;
  lane: Lane | undefined;
  seconds: number | undefined;
  /** The bubble over the speaker's tank, in CSS pixels, while the line is said and the speaker lives. */
  bubble: { x: number; y: number; opacity: number } | undefined;
  /**
   * The shot from the speaker's tank at the line's marker, in CSS pixels, with the seconds it
   * flies and the bubble's opacity; `undefined` without a bubble or a marker, or when the marker
   * is on the speaker.
   */
  shot: { from: { x: number; y: number }; to: { x: number; y: number }; flight: number; opacity: number } | undefined;
  /**
   * The line's marker, in CSS pixels. A marker off the screen is held at its edge, with `edge`
   * the direction it lies in, in radians on screen; `undefined` while it is on the screen.
   */
  marker: { x: number; y: number; kind: MarkerKind; opacity: number; edge: number | undefined } | undefined;
};

/**
 * What the bots say on the radio, over the canvas: a word or two in a bubble in the poster look
 * over each speaker's tank, edged in its team's color, a shot in the team's color fired from the
 * speaker at what the line is about, and the line's marker on the map, which pops up where the
 * shot lands, held at the edge of the screen with a pointer when what it marks lies off it.
 */
export function RadioOverlay(props: { callouts: readonly CalloutView[] }) {
  const { t } = useKothI18n();

  /** The line in the display's language, with the names it takes filled in. */
  const text = (callout: CalloutView) => {
    const words = {
      tankClass: callout.tankClass ? t(`tankClass.${callout.tankClass}`) : '',
      name: callout.ally ? seatName(t, callout.ally) : '',
      lane: callout.lane ? t(`lane.${callout.lane}`) : '',
      seconds: callout.seconds ?? 0
    };
    const line = t(`radio.${callout.line}`, words);
    return typeof line === 'string' ? line : '';
  };

  return (
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <svg class="absolute inset-0 h-full w-full overflow-visible">
        <For each={props.callouts} keyed={(callout) => callout.id}>
          {(callout) => (
            <Show when={callout().shot}>
              {(shot) => <RadioShot {...shot()} team={callout().team} />}
            </Show>
          )}
        </For>
      </svg>
      <For each={props.callouts} keyed={(callout) => callout.id}>
        {(callout) => (
          <>
            <Show when={callout().marker}>
              {(marker) => (
                <div
                  class="tk-marker"
                  style={{
                    left: `${marker().x}px`,
                    top: `${marker().y}px`,
                    opacity: marker().opacity,
                    '--tk-marker-team': TEAM_CSS[callout().team],
                    // Popped up where the line's shot lands, read once as the marker first shows.
                    '--tk-marker-delay': `${untrack(() => callout().shot?.flight ?? 0)}s`
                  }}
                >
                  <MarkerIcon kind={marker().kind} />
                  <Show when={marker().edge}>
                    {(edge) => <span class="tk-marker-arrow" style={{ transform: `rotate(${edge()}rad) translateX(24px)` }} />}
                  </Show>
                </div>
              )}
            </Show>
            <Show when={callout().bubble}>
              {(bubble) => (
                <div
                  class="tk-bubble"
                  style={{ left: `${bubble().x}px`, top: `${bubble().y}px`, opacity: bubble().opacity, '--tk-bubble-team': TEAM_CSS[callout().team] }}
                >
                  {text(callout())}
                </div>
              )}
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

/**
 * A shot from `from` to `to`, on screen, in the team's color: a short tracer flies to the target
 * in `flight` s, as read when it is fired, over a faint trail that fades once it lands, and a
 * ring flashes where it hits. Nothing of it stays.
 */
function RadioShot(props: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  flight: number;
  opacity: number;
  team: TeamId;
}) {
  const flight = untrack(() => props.flight);

  return (
    <g class="tk-shot" style={{ opacity: props.opacity, '--tk-shot-team': TEAM_CSS[props.team], '--tk-shot-flight': `${flight}s` }}>
      <line class="tk-shot-trail" x1={props.from.x} y1={props.from.y} x2={props.to.x} y2={props.to.y} pathLength={1} />
      <line class="tk-shot-tracer" x1={props.from.x} y1={props.from.y} x2={props.to.x} y2={props.to.y} pathLength={1} />
      <circle class="tk-shot-hit" cx={props.to.x} cy={props.to.y} r="20" />
    </g>
  );
}

/** The marker's glyph, 32 px, in ink on paper with the team's color where it matters. */
function MarkerIcon(props: { kind: MarkerKind }) {
  return (
    <svg viewBox="-11 -11 22 22" width="32" height="32">
      <circle r="9.5" fill={PAPER} stroke={INK} stroke-width="2" />
      {(() => {
        switch (props.kind) {
          case 'attack':
            return <path d="M -4 -5 L 5 0 L -4 5 Z" fill="var(--tk-marker-team)" stroke={INK} stroke-width="1.2" />;
          case 'gather':
            return <circle r="3.5" fill="var(--tk-marker-team)" stroke={INK} stroke-width="1.2" />;
          case 'help':
            return <path d="M -1.6 -5.5 H 1.6 V -1.6 H 5.5 V 1.6 H 1.6 V 5.5 H -1.6 V 1.6 H -5.5 V -1.6 H -1.6 Z" fill="#e0321e" />;
          case 'enemy':
            return (
              <g stroke={INK} stroke-width="1.6" fill="none">
                <circle r="4.5" />
                <path d="M 0 -8 V -3 M 0 3 V 8 M -8 0 H -3 M 3 0 H 8" />
              </g>
            );
          case 'hold':
            return <path d="M -4.5 -5 H 4.5 V 0.5 L 0 5.5 L -4.5 0.5 Z" fill="var(--tk-marker-team)" stroke={INK} stroke-width="1.2" />;
          case 'kit':
            return <path d="M -1.6 -5.5 H 1.6 V -1.6 H 5.5 V 1.6 H 1.6 V 5.5 H -1.6 V 1.6 H -5.5 V -1.6 H -1.6 Z" fill="#4d9e52" />;
          case 'breach':
            return (
              <>
                <path d="M -6 -4 H -1 V 4 H -6 Z M 1 -4 H 6 V 4 H 1 Z" fill="#c9473b" stroke={INK} stroke-width="1" />
                <path d="M 0 -6 L -1.5 -1 L 1.5 1 L 0 6" fill="none" stroke={INK} stroke-width="1.4" />
              </>
            );
          case 'base':
            return <path d="M -5.5 0.5 L 0 -5 L 5.5 0.5 V 5 H -5.5 Z" fill="var(--tk-marker-team)" stroke={INK} stroke-width="1.2" />;
          case 'danger':
            return (
              <>
                <path d="M 0 -6.5 L 6.5 5 H -6.5 Z" fill="#f2c418" stroke={INK} stroke-width="1.2" />
                <path d="M 0 -2.5 V 1.2 M 0 2.8 V 3.6" stroke={INK} stroke-width="1.6" />
              </>
            );
        }
      })()}
    </svg>
  );
}

/** Team colors as `poster.css` has them, and its paper and ink, for inline styles and SVG fills. */
const TEAM_CSS: Record<TeamId, string> = { red: '#c9473b', blue: '#3b73c9' };
const PAPER = '#fbf6ea';
const INK = '#141414';
