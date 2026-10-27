import { For, Show } from 'solid-js';
import { ClassSilhouette } from './classes/ClassMenu';
import { TANK_CLASSES } from './classes/classes';
import { FULL_CHARGE } from './classes/weapon';
import { LONG_SHOT, type Highlight } from './highlights';
import { en } from './i18n/en';
import { useKothI18n } from './i18n/i18n';
import type { KillCamView } from './killCam';
import type { KothMatch, MemberHud, SeatHud } from './match';
import './poster.css';
import type { TeamId } from './rules';
import type { SaveState } from './saveRecording';

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
 * The match display over the canvas, in the poster look of `poster.css`: the teams' clocks either
 * side of the point's state, who of each team is alive or respawning, the kill feed, and the
 * player's armor or respawn countdown.
 *
 * @param watching - The player watches the bots, so the player's own panel is hidden.
 */
export function KothHud(props: { state: HudState | undefined; watching: boolean }) {
  return (
    <Show when={props.state}>
      {(state) => (
        <>
          <div class="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-start gap-3">
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

/** A team's clock, kills and plan, and its members: filled pips for tanks in play, paper ones with a countdown for tanks respawning. */
function TeamPanel(props: { team: TeamId; state: HudState }) {
  const { t } = useKothI18n();
  const team = () => props.state.teams[props.team];
  const owns = () => props.state.capture.owner === props.team;
  const plan = () =>
    team().plan.intent === 'push' && team().plan.phase !== 'none'
      ? `${t('plan.push')} · ${t(`plan.${team().plan.phase as 'gather' | 'go'}`)}`
      : t(`plan.${team().plan.intent}`);

  return (
    <div class={['flex flex-col gap-1.5', props.team === 'red' ? 'items-end' : 'items-start']}>
      <div
        class="tk-clock"
        style={{
          background: owns() ? TEAM_CSS[props.team] : undefined,
          color: owns() ? PAPER : undefined,
          opacity: owns() || props.state.capture.owner === undefined ? 1 : 0.75
        }}
      >
        {clock(team().left)}
      </div>
      <div class={['flex gap-1', { 'flex-row-reverse': props.team === 'red' }]}>
        <For each={team().members} keyed={(member) => member.id}>
          {(member) => <MemberPip team={props.team} member={member()} />}
        </For>
      </div>
      <div class="tk-tag">
        {t('hud.kills', team().kills)} · {plan()}
      </div>
    </div>
  );
}

/** A member of a team: its class, a yellow inner ring for the player's seat, a countdown while respawning. */
function MemberPip(props: { team: TeamId; member: MemberHud }) {
  const { t } = useKothI18n();

  return (
    <div
      class={['tk-pip', { 'tk-player': props.member.player }]}
      title={`${seatName(t, props.member)} · ${t(`tankClass.${props.member.tankClass}`)} · ${t(`botRole.${props.member.role}`)} · ${props.member.kills}/${props.member.deaths}`}
      style={{
        background: props.member.alive ? TEAM_CSS[props.team] : PAPER,
        color: props.member.alive ? PAPER : TEAM_CSS[props.team]
      }}
    >
      {props.member.alive ? t(`short.${props.member.tankClass}`) : Math.ceil(props.member.respawnIn)}
    </div>
  );
}

/**
 * The control point as a poster disc with a hard shadow: filled in the owner's color, with a ring
 * that fills in the capturing team's color, how many tanks of the capturing team stand on it, and
 * a tag while it is locked, contested or in overtime. While the point is locked the disc counts
 * down the seconds until it opens.
 */
function PointDial(props: { state: HudState }) {
  const { t } = useKothI18n();
  const capture = () => props.state.capture;
  const circumference = 2 * Math.PI * 21;

  return (
    <div class="flex flex-col items-center gap-1">
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="31" cy="31" r="27" fill={INK} />
        <circle cx="28" cy="28" r="26" fill={INK} />
        <circle cx="28" cy="28" r="18" fill={capture().owner ? TEAM_CSS[capture().owner!] : PAPER} />
        <circle
          cx="28"
          cy="28"
          r="21"
          fill="none"
          stroke={capture().capturer ? TEAM_CSS[capture().capturer!] : 'transparent'}
          stroke-width="5"
          stroke-dasharray={`${capture().progress * circumference} ${circumference}`}
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="34" text-anchor="middle" font-size="17" font-weight="700" fill={capture().owner ? PAPER : INK}>
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
        <div class={['tk-tag', { 'tk-tag-red': capture().contested || capture().overtime }]}>
          {capture().locked > 0 ? t('hud.locked') : capture().overtime ? t('hud.overtime') : t('hud.contested')}
        </div>
      </Show>
    </div>
  );
}

/** The last few kills, newest at the bottom. */
function KillFeed(props: { feed: HudState['feed'] }) {
  const { t } = useKothI18n();

  return (
    <div class="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1.5">
      <For each={props.feed} keyed={(entry) => entry.id}>
        {(entry) => (
          <div class="tk-feed">
            <Show when={entry().killer}>
              {(killer) => <span style={{ color: TEAM_CSS[killer().team] }}>{seatName(t, killer())}</span>}
            </Show>
            <Show when={entry().turret}>{(turret) => <span style={{ color: TEAM_CSS[turret()] }}>{t('seat.turret')}</span>}</Show>
            <span class="px-1.5">✕</span>
            <span style={{ color: TEAM_CSS[entry().victim.team] }}>{seatName(t, entry().victim)}</span>
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
  const { t } = useKothI18n();
  const tankClass = () => TANK_CLASSES[props.player.tankClass];
  const next = () => props.player.nextClass;

  return (
    <div class="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      <Show
        when={props.player.alive}
        fallback={
          <div class="tk-card flex flex-col items-center px-4 py-1.5">
            <div class="text-xl font-bold tracking-wide uppercase">
              {t('hud.respawn', Math.ceil(props.player.respawnIn), t(`tankClass.${next() ?? props.player.tankClass}`))}
            </div>
            <div class="tk-note">{t('hud.changeClass')}</div>
          </div>
        }
      >
        <Show when={props.player.coreOpen}>
          <div class="tk-tag tk-tag-red text-[13px]">{t('hud.coreOpen')}</div>
        </Show>
        <Show when={props.player.mending}>
          <div class="tk-tag tk-tag-blue">{t('hud.mending')}</div>
        </Show>
        <div class="tk-card flex items-center gap-3 px-3 py-1.5">
          <div class="flex flex-col items-center">
            <ClassSilhouette tankClass={tankClass()} color={PLAYER_CSS} width={64} height={32} />
            <div class="text-xs font-bold tracking-wider uppercase">{t(`tankClass.${props.player.tankClass}`)}</div>
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="tk-bar w-52">
              <div style={{ width: `${Math.round(props.player.armor * 100)}%` }} />
            </div>
            <WeaponState player={props.player} />
          </div>
        </div>
        <Show when={next()}>
          {(after) => <div class="tk-tag tk-tag-yellow">{t('hud.nextRespawn', t(`tankClass.${after()}`))}</div>}
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
  const { t } = useKothI18n();
  const charge = () => props.player.charge;

  return (
    <Show when={props.player.weapon === 'charge'}>
      <Gauge
        label={
          charge() === undefined
            ? t('hud.gauge.idle')
            : charge()! >= FULL_CHARGE
              ? t('hud.gauge.full')
              : t('hud.gauge.charging')
        }
        value={charge() ?? 0}
        color={charge() === undefined ? '#8a8a8a' : charge()! >= FULL_CHARGE ? 'var(--red)' : 'var(--yellow)'}
      />
    </Show>
  );
}

/** A bar 0-1 with a label before it. */
function Gauge(props: { label: string; value: number; color: string }) {
  return (
    <div class="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
      <div class="w-14 truncate text-right">{props.label}</div>
      <div class="tk-bar h-2.5 flex-1" style={{ '--fill-color': props.color }}>
        <div style={{ width: `${Math.round(Math.min(Math.max(props.value, 0), 1) * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * The end of a match on a poster sheet with a wedge in the winner's color: the winner, every member's kills and
 * deaths with the player's line in yellow, a button to play again, one to watch the match again and one to save
 * its recording, with where the recording went once saved.
 *
 * @param saved - The save under way or done for this match, if any.
 * @param onSave - Called when the player asks to save the recording.
 * @param onRestart - Called when the player asks for another match.
 * @param onWatch - Called when the player asks to watch the match again.
 * @param highlights - The match's best kills (see `bestKills`), with their killers' and victims' seats; `onHighlight` watches one.
 */
export function MatchResult(props: {
  state: HudState | undefined;
  saved: SaveState | undefined;
  onSave: () => void;
  onRestart: () => void;
  onWatch: () => void;
  highlights: readonly { kill: Highlight; killer: SeatHud; victim: SeatHud }[];
  onHighlight: (kill: Highlight) => void;
}) {
  const { t } = useKothI18n();

  return (
    <Show when={props.state?.capture.winner}>
      {(winner) => (
        <div class="tk-backdrop absolute inset-0 grid place-items-center">
          <div class="tk-sheet min-w-[640px]">
            <header class="tk-head" style={{ '--wedge': TEAM_CSS[winner()] }}>
              <div class="tk-wedge" />
              <div class="tk-disc" />
              <div class="tk-title">{t(`result.wins.${winner()}`)}</div>
            </header>
            <div class="flex justify-center gap-8 px-[18px] pt-4 pb-2">
              <For each={['red', 'blue'] as const}>
                {(team) => (
                  <table class="tk-table">
                    <thead>
                      <tr>
                        <th class="text-left" style={{ color: TEAM_CSS[team] }}>
                          {t(`result.team.${team}`)} ·{' '}
                          {t('result.held', Math.round(props.state!.holdTime - props.state!.teams[team].left))}
                        </th>
                        <th>{t('result.kills')}</th>
                        <th>{t('result.deaths')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={props.state!.teams[team].members} keyed={(member) => member.id}>
                        {(member) => (
                          <tr class={{ 'tk-player': member().player }}>
                            <td>{seatName(t, member())}</td>
                            <td class="text-center">{member().kills}</td>
                            <td class="text-center">{member().deaths}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                )}
              </For>
            </div>
            <Show when={props.highlights.length > 0}>
              <div class="flex flex-col gap-1 px-[18px] pt-1 pb-2">
                <div class="tk-bot-heading">
                  <span>{t('highlights.title')}</span>
                  <i />
                </div>
                <For each={props.highlights}>
                  {(entry) => (
                    <button class="tk-highlight" onClick={() => props.onHighlight(entry.kill)}>
                      <span class="tk-highlight-play">▶</span>
                      <span class="tk-highlight-time">{clock(Math.floor(entry.kill.step / 60))}</span>
                      <span>
                        <b style={{ color: TEAM_CSS[entry.killer.team] }}>{seatName(t, entry.killer)}</b>
                        {entry.kill.killerClass ? ` (${t(`tankClass.${entry.kill.killerClass}`)})` : ''} →{' '}
                        <b style={{ color: TEAM_CSS[entry.victim.team] }}>{seatName(t, entry.victim)}</b> ({t(`tankClass.${entry.kill.victimClass}`)})
                      </span>
                      <span class="tk-note">{highlightTags(t, entry.kill)}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="flex justify-center gap-3 px-[18px] pt-2">
              <button class="tk-action tk-primary w-56" onClick={() => props.onRestart()}>
                <span class="tk-action-label">{t('result.again')}</span>
                <kbd class="tk-key">R</kbd>
              </button>
              <button class="tk-action w-56" onClick={() => props.onWatch()}>
                <span class="tk-action-label">{t('replay.watch')}</span>
              </button>
              <button class="tk-action w-56" disabled={props.saved?.kind === 'saving'} onClick={() => props.onSave()}>
                <span class="tk-action-label">{t('recording.save')}</span>
              </button>
            </div>
            <div class="px-[18px] pt-1.5 pb-4 text-center text-[12px] break-all">{props.saved ? saveText(t, props.saved) : t('recording.saveHint')}</div>
          </div>
        </div>
      )}
    </Show>
  );
}

/** What made a best kill: its range if long, the streak, a hurt killer, the point. */
function highlightTags(t: ReturnType<typeof useKothI18n>['t'], kill: Highlight) {
  return [
    kill.range >= LONG_SHOT ? t('highlights.long', kill.range) : undefined,
    kill.streak > 1 ? t('highlights.streak', kill.streak) : undefined,
    kill.hurt ? t('highlights.hurt') : undefined,
    kill.point ? t('highlights.point') : undefined
  ]
    .filter((tag) => tag !== undefined)
    .join(' · ');
}

/**
 * Where a saved recording went, or that it is being saved, in the display's language; `short`
 * leaves out the file's path and name, for a narrow line.
 */
export function saveText(t: ReturnType<typeof useKothI18n>['t'], saved: SaveState, short = false) {
  switch (saved.kind) {
    case 'saving':
      return t('recording.saving');
    case 'saved':
      return short ? t('recording.savedShort') : t('recording.saved', saved.path);
    case 'downloaded':
      return short ? t('recording.downloadedShort') : t('recording.downloaded', saved.name);
    default:
      return t('recording.failed');
  }
}

/** The name of whoever sits in `seat`, in the display's language: the player, or a team's seat counted from 1. */
export function seatName(t: ReturnType<typeof useKothI18n>['t'], seat: SeatHud) {
  if (seat.player) {
    return seat.human ? t('seat.you') : t('seat.youBot');
  }

  return t(`seat.${seat.team}`, seat.seat + 1);
}

/**
 * What the kill-cam shows over its film (see `createKillCam`): black bars that come in and go,
 * the picture greyed, scan lines and «◀◀ REW» while the tape runs back, the killer's card with
 * what it had in mind, and the shot's range and the armor the
 * killer had left, and the player's respawn countdown, as the match's display is hidden meanwhile;
 * any key skips it.
 */
export function KillCamOverlay(props: { view: KillCamView | undefined; respawn: HudState['player'] | undefined }) {
  const { t } = useKothI18n();

  return (
    <Show when={props.view}>
      {(view) => (
        <div class="pointer-events-none absolute inset-0 overflow-hidden">
          <div class="tk-killcam-grey" style={{ 'backdrop-filter': `grayscale(${view().grey}) contrast(${1 + view().grey * 0.15})` }} />
          <Show when={view().rewind}>
            <div class="tk-killcam-rewind">
              <b>{t('killCam.rewind')}</b>
            </div>
          </Show>
          <div class="tk-killcam-bar tk-top" style={{ transform: `translateY(${(view().bars - 1) * 100}%)` }}>
            <b>{t('killCam.title')}</b>
          </div>
          <div class="tk-killcam-bar tk-bottom" style={{ transform: `translateY(${(1 - view().bars) * 100}%)` }}>
            <Show when={view().stats}>
              {(stats) => (
                <span style={{ opacity: stats().opacity }}>
                  {t('killCam.range', stats().range)}
                  {stats().armor === undefined ? '' : ` · ${t('killCam.armor', Math.round(stats().armor! * 100))}`}
                </span>
              )}
            </Show>
            <Show when={props.respawn && !props.respawn.alive && props.respawn}>
              {(player) => <span>{t('hud.respawn', Math.ceil(player().respawnIn), t(`tankClass.${player().nextClass ?? player().tankClass}`))}</span>}
            </Show>
            <span class="tk-note">{t('killCam.skip')}</span>
          </div>
          <Show when={view().card}>
            {(card) => (
              <div
                class="tk-killcam-card"
                style={{ opacity: card().opacity, transform: `translateX(${(card().opacity - 1) * 40}px)`, '--team': card().killer ? TEAM_CSS[card().killer!.team] : 'var(--ink)' }}
              >
                <Show when={card().killer} fallback={<b>{t('killCam.lost')}</b>}>
                  {(killer) => (
                    <>
                      <span class="tk-note">{t('killCam.killedBy')}</span>
                      <b>{seatName(t, killer())}</b>
                      <span>{card().tankClass ? t(`tankClass.${card().tankClass!}`) : ''}</span>
                      <Show when={card().streak > 1}>
                        <i>{t('killCam.streak', card().streak)}</i>
                      </Show>
                      <Show when={thoughtOf(card())}>{(thought) => <p>«{thought()}»</p>}</Show>
                    </>
                  )}
                </Show>
              </div>
            )}
          </Show>
        </div>
      )}
    </Show>
  );

  /** The killer's thought in words: its goal and action, and that it was after the player. */
  function thoughtOf(card: NonNullable<KillCamView['card']>) {
    const goal = card.goal && card.goal in en.killCam.goals ? t(`killCam.goals.${card.goal as keyof typeof en.killCam.goals}`) : undefined;
    const action = card.action && card.action in en.killCam.actions ? t(`killCam.actions.${card.action as keyof typeof en.killCam.actions}`) : undefined;
    return [card.onYou ? t('killCam.onYou') : goal, action].filter(Boolean).join(' · ');
  }
}

/**
 * The mark over the tank that last destroyed the player's, until the player destroys it: on the
 * tank, or held at the screen's edge with an arrow toward it.
 */
export function RevengeMark(props: { mark: { x: number; y: number; edge: number | undefined } | undefined }) {
  const { t } = useKothI18n();

  return (
    <Show when={props.mark}>
      {(mark) => (
        <div class="tk-revenge-mark pointer-events-none absolute" style={{ left: `${mark().x}px`, top: `${mark().y}px` }}>
          <Show when={mark().edge !== undefined}>
            <i style={{ transform: `rotate(${mark().edge}rad)` }}>➤</i>
          </Show>
          <b>☠ {t('revenge.mark')}</b>
        </div>
      )}
    </Show>
  );
}

/** «REVENGE!» across the screen when the player destroys the tank that destroyed theirs; `at` is when, and plays it anew. */
export function RevengeBanner(props: { at: number | undefined }) {
  const { t } = useKothI18n();

  return (
    <Show when={props.at} keyed>
      <div class="tk-revenge pointer-events-none absolute top-[30%] left-1/2">
        <b>{t('revenge.done')}</b>
      </div>
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
/** The poster's paper and ink, as `poster.css` has them, for SVG fills and inline colors. */
const PAPER = '#fbf6ea';
const INK = '#141414';
/** Lighter team colors for text on dark backgrounds. */
const TEAM_TEXT: Record<TeamId, string> = { red: '#ff8a7a', blue: '#8ab4ff' };

/** Seconds as m:ss. */
function clock(seconds: number) {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
