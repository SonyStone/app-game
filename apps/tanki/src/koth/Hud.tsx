import { For, Show } from 'solid-js';
import { ClassSilhouette } from './classes/ClassMenu';
import { TANK_CLASSES } from './classes/classes';
import { FULL_CHARGE } from './classes/weapon';
import type { KothMatch, MemberHud } from './match';
import type { TeamId } from './rules';
import type { TankClassId } from './tanks';

/** What the heads-up display shows, from `KothMatch['hud']`. */
export type HudState = ReturnType<KothMatch['hud']>;

/** One bot's thoughts placed on screen for the debug overlay. */
export type ThoughtView = {
  id: number;
  team: TeamId;
  name: string;
  role: string;
  goal: string;
  action: string;
  /** The plan's actions joined by arrows. */
  steps: string;
  /** Name of the ally a support covers. */
  covering: string | undefined;
  /** The tank's position on screen, in CSS pixels. */
  x: number;
  y: number;
  /** The path ahead as SVG polyline points. */
  path: string;
  /** Where the enemy it deals with is on screen. */
  target: { x: number; y: number } | undefined;
};

/**
 * The match display over the canvas: the teams' clocks either side of the point's state, who of
 * each team is alive or respawning, the kill feed, and the player's armor or respawn countdown.
 *
 * @param watching - The player watches the bots, so the player's own panel is hidden.
 */
export function KothHud(props: { state: HudState | undefined; watching: boolean }) {
  return (
    <Show when={props.state}>
      {(state) => (
        <>
          <div class="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-start gap-3 text-white">
            <TeamPanel team="red" state={state()} />
            <PointDial state={state()} />
            <TeamPanel team="blue" state={state()} />
          </div>
          <KillFeed feed={state().feed} />
          <Show when={!props.watching}>
            <PlayerPanel player={state().player} />
          </Show>
        </>
      )}
    </Show>
  );
}

/** A team's clock, kills and members: filled pips for tanks in play, outlined ones with a countdown for tanks respawning. */
function TeamPanel(props: { team: TeamId; state: HudState }) {
  const team = () => props.state.teams[props.team];
  const owns = () => props.state.capture.owner === props.team;

  return (
    <div class={`flex flex-col gap-1 ${props.team === 'red' ? 'items-end' : 'items-start'}`}>
      <div
        class="min-w-24 rounded px-3 py-1 text-center text-2xl font-bold tabular-nums"
        style={{
          background: owns() ? TEAM_CSS[props.team] : 'rgba(0, 0, 0, 0.45)',
          opacity: owns() || props.state.capture.owner === undefined ? 1 : 0.7
        }}
      >
        {clock(team().left)}
      </div>
      <div class={`flex gap-1 ${props.team === 'red' ? 'flex-row-reverse' : ''}`}>
        <For each={team().members} keyed={(member) => member.id}>
          {(member) => <MemberPip team={props.team} member={member()} />}
        </For>
      </div>
      <div class="text-xs text-white/70">
        {team().kills} kills · {team().plan}
      </div>
    </div>
  );
}

/** A member of a team: its class, a ring for the player, a countdown while respawning. */
function MemberPip(props: { team: TeamId; member: MemberHud }) {
  return (
    <div
      class="grid h-6 w-7 place-items-center rounded text-[11px] font-bold tabular-nums"
      title={`${props.member.name} · ${TANK_CLASSES[props.member.tankClass].name} · ${props.member.role} · ${props.member.kills}/${props.member.deaths}`}
      style={{
        background: props.member.alive ? TEAM_CSS[props.team] : 'rgba(0, 0, 0, 0.45)',
        border: `2px solid ${props.member.human ? '#ffffff' : props.member.alive ? 'rgba(0, 0, 0, 0.35)' : TEAM_CSS[props.team]}`
      }}
    >
      {props.member.alive ? CLASS_ABBREVIATIONS[props.member.tankClass] : Math.ceil(props.member.respawnIn)}
    </div>
  );
}

/**
 * The control point: a disc in the owner's color with a ring that fills in the capturing team's
 * color, how many tanks of each team stand on it, and whether it is contested or in overtime.
 * While the point is locked the disc counts down the seconds until it opens.
 */
function PointDial(props: { state: HudState }) {
  const capture = () => props.state.capture;
  const circumference = 2 * Math.PI * 22;

  return (
    <div class="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56" class="drop-shadow">
        <circle cx="28" cy="28" r="22" fill={capture().owner ? TEAM_CSS[capture().owner!] : '#d8d8d4'} stroke="rgba(0, 0, 0, 0.6)" stroke-width="6" />
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke={capture().capturer ? TEAM_CSS[capture().capturer!] : 'transparent'}
          stroke-width="6"
          stroke-dasharray={`${capture().progress * circumference} ${circumference}`}
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="33" text-anchor="middle" font-size="15" font-weight="bold" fill="#ffffff" stroke="rgba(0,0,0,0.5)" stroke-width="0.6">
          {capture().locked > 0
            ? Math.ceil(capture().locked)
            : capture().contested
              ? '⚔'
              : capture().capturer && props.state.teams[capture().capturer!].onPoint > 0
                ? `×${props.state.teams[capture().capturer!].onPoint}`
                : ''}
        </text>
      </svg>
      <Show when={capture().locked > 0 || capture().contested || capture().overtime}>
        <div class="rounded bg-black/55 px-2 py-0.5 text-xs font-bold tracking-wide">
          {capture().locked > 0 ? 'LOCKED' : capture().overtime ? 'OVERTIME' : 'CONTESTED'}
        </div>
      </Show>
    </div>
  );
}

/** The last few kills, newest at the bottom. */
function KillFeed(props: { feed: HudState['feed'] }) {
  return (
    <div class="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 text-sm">
      <For each={props.feed} keyed={(entry) => entry.id}>
        {(entry) => (
          <div class="rounded bg-black/45 px-2 py-0.5 text-white">
            <Show when={entry().killer}>
              {(killer) => <span style={{ color: TEAM_TEXT[killer().team] }}>{killer().name}</span>}
            </Show>
            <span class="px-1.5 text-white/70">✕</span>
            <span style={{ color: TEAM_TEXT[entry().victim.team] }}>{entry().victim.name}</span>
          </div>
        )}
      </For>
    </div>
  );
}

/**
 * The player's class, armor, weapon and warnings, or the countdown to respawning with the class
 * that comes next.
 */
function PlayerPanel(props: { player: HudState['player'] }) {
  const tankClass = () => TANK_CLASSES[props.player.tankClass];
  const next = () => props.player.nextClass && TANK_CLASSES[props.player.nextClass];

  return (
    <div class="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-white">
      <Show
        when={props.player.alive}
        fallback={
          <div class="flex flex-col items-center gap-1 rounded bg-black/55 px-4 py-2">
            <div class="text-xl font-bold">
              Respawning in {Math.ceil(props.player.respawnIn)} as {(next() ?? tankClass()).name}
            </div>
            <div class="text-xs text-white/70">C or 1-5: change class</div>
          </div>
        }
      >
        <Show when={props.player.coreOpen}>
          <div class="rounded bg-[#e0662a] px-2 py-0.5 text-sm font-bold">Core exposed — get to cover or your base</div>
        </Show>
        <Show when={props.player.mending}>
          <div class="rounded bg-black/45 px-2 py-0.5 text-xs">Mending armor</div>
        </Show>
        <div class="flex items-end gap-3 rounded bg-black/35 px-3 py-1.5">
          <div class="flex flex-col items-center">
            <ClassSilhouette tankClass={tankClass()} color={PLAYER_CSS} width={64} height={32} />
            <div class="text-xs font-bold">{tankClass().name}</div>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="h-2 w-48 overflow-hidden rounded bg-black/45">
              <div class="h-full bg-white/85" style={{ width: `${Math.round(props.player.armor * 100)}%` }} />
            </div>
            <WeaponState player={props.player} />
          </div>
        </div>
        <Show when={next()}>
          {(after) => <div class="rounded bg-black/45 px-2 py-0.5 text-xs">Next respawn: {after().name}</div>}
        </Show>
      </Show>
    </div>
  );
}

/**
 * The charge of the player's casemate gun, marked full once it pierces most. The other guns fire
 * at a steady cadence for as long as the trigger is held, with nothing to keep count of, and show
 * nothing here.
 */
function WeaponState(props: { player: HudState['player'] }) {
  const charge = () => props.player.charge;

  return (
    <Show when={props.player.weapon === 'charge'}>
      <Gauge
        label={charge() === undefined ? 'Hold' : charge()! >= FULL_CHARGE ? 'FULL' : 'Charge'}
        value={charge() ?? 0}
        color={charge() === undefined ? '#8a8a8a' : charge()! >= FULL_CHARGE ? '#ff5a3c' : '#ffd27a'}
      />
    </Show>
  );
}

/** A bar 0-1 with a label before it. */
function Gauge(props: { label: string; value: number; color: string }) {
  return (
    <div class="flex items-center gap-1.5 text-[10px] font-bold">
      <div class="w-10 text-right">{props.label}</div>
      <div class="h-3 w-36 overflow-hidden rounded-sm bg-black/45">
        <div class="h-full" style={{ width: `${Math.round(Math.min(Math.max(props.value, 0), 1) * 100)}%`, background: props.color }} />
      </div>
    </div>
  );
}

/**
 * The end of a match: the winner, every member's kills and deaths, and a button to play again.
 *
 * @param onRestart - Called when the player asks for another match.
 */
export function MatchResult(props: { state: HudState | undefined; onRestart: () => void }) {
  return (
    <Show when={props.state?.capture.winner}>
      {(winner) => (
        <div class="absolute inset-0 grid place-items-center bg-black/45 text-white">
          <div class="flex flex-col items-center gap-4 rounded-lg bg-black/60 px-8 py-6">
            <div class="text-4xl font-bold tracking-wide" style={{ color: TEAM_TEXT[winner()] }}>
              {winner() === 'red' ? 'RED' : 'BLUE'} TEAM WINS
            </div>
            <div class="flex gap-8 text-sm">
              <For each={['red', 'blue'] as const}>
                {(team) => (
                  <table class="border-collapse">
                    <thead>
                      <tr class="text-white/60">
                        <th class="pr-4 text-left font-normal" style={{ color: TEAM_TEXT[team] }}>
                          {team === 'red' ? 'Red' : 'Blue'} · held {Math.round(props.state!.holdTime - props.state!.teams[team].left)} s
                        </th>
                        <th class="px-2 font-normal">K</th>
                        <th class="px-2 font-normal">D</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={props.state!.teams[team].members} keyed={(member) => member.id}>
                        {(member) => (
                          <tr class={member().human ? 'font-bold' : ''}>
                            <td class="pr-4">{member().name}</td>
                            <td class="px-2 text-center tabular-nums">{member().kills}</td>
                            <td class="px-2 text-center tabular-nums">{member().deaths}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                )}
              </For>
            </div>
            <button class="rounded border-0 bg-white px-4 py-2 text-base font-bold text-black" onClick={() => props.onRestart()}>
              Play again (R)
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}

/**
 * What every bot thinks, drawn over its tank: its role, goal and current action with the rest of
 * its plan, the path it drives in its team's color and a line to the enemy it deals with.
 */
export function BotThoughts(props: { thoughts: readonly ThoughtView[] }) {
  return (
    <>
      <svg class="pointer-events-none absolute inset-0 h-full w-full">
        <For each={props.thoughts} keyed={(thought) => thought.id}>
          {(thought) => (
            <>
              <polyline points={thought().path} fill="none" stroke={TEAM_TEXT[thought().team]} stroke-width="1.5" stroke-dasharray="5 4" opacity="0.85" />
              <Show when={thought().target}>
                {(target) => (
                  <line x1={thought().x} y1={thought().y} x2={target().x} y2={target().y} stroke="#ffd34d" stroke-width="1" opacity="0.6" />
                )}
              </Show>
            </>
          )}
        </For>
      </svg>
      <For each={props.thoughts} keyed={(thought) => thought.id}>
        {(thought) => (
          <div
            class="pointer-events-none absolute whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[11px] leading-tight text-white"
            style={{ left: `${thought().x}px`, top: `${thought().y - 46}px`, transform: 'translateX(-50%)' }}
          >
            <div>
              <span style={{ color: TEAM_TEXT[thought().team] }}>{thought().name}</span>
              <span class="text-white/60">
                {' '}
                · {thought().role}
                {thought().covering ? ` · covers ${thought().covering}` : ''}
              </span>
            </div>
            <div>
              <b>{thought().goal}</b> → {thought().action}
            </div>
            <div class="text-white/55">{thought().steps}</div>
          </div>
        )}
      </For>
    </>
  );
}

/** Team colors for panels, as CSS, matching the hulls, and the player's own hull color. */
const TEAM_CSS: Record<TeamId, string> = { red: '#c9473b', blue: '#3b73c9' };
const PLAYER_CSS = '#f0773a';
/** Short names of the classes for the team panels. */
const CLASS_ABBREVIATIONS: Record<TankClassId, string> = { scout: 'Sc', soldier: 'So', heavy: 'Hv', demoman: 'De', sniper: 'Sn' };
/** Lighter team colors for text on dark backgrounds. */
const TEAM_TEXT: Record<TeamId, string> = { red: '#ff8a7a', blue: '#8ab4ff' };

/** Seconds as m:ss. */
function clock(seconds: number) {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
