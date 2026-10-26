import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { AIM_LOOK_IDS, AIM_LOOKS, type AimLookId } from './AimOverlay';
import { PACE_DEFAULTS, PACE_KNOBS, type Pace } from './pace';
import { MEDIUM_TANK } from './tanks';

/**
 * The menu Esc opens over a paused match, drawn as a constructivist poster to go with the game's
 * flat shapes and black contours: paper, a red wedge, thick black rules and hard shadows. It holds
 * what the keys do during play, so a test can be set up without remembering them:
 *
 * - The match: resume, restart, the class menu, and watching the bots or taking the tank back.
 * - The view: the aim's look and the bots' thoughts.
 * - The pace knobs (see `Pace`), which take effect at once: a slider for each with a notch at its
 *   default, a value that turns yellow while it differs from it, what the knobs make of the medium
 *   tank, its shell and the bots, and a reset that puts every knob back.
 * - What every key does.
 *
 * A click outside the menu resumes. Each action names its key, which does the same in play.
 *
 * @param className - Name of the player's class, on the class button.
 * @param thoughts - Whether the bots' thoughts are shown in play; watching shows them regardless, and the switch is off limits then.
 * @param watching - Whether the player is watching the bots, which turns the watch button into taking the tank back.
 * @param onPace - Receives the whole pace after a knob moved or the reset.
 */
export function PauseMenu(props: {
  pace: Pace;
  onPace: (pace: Pace) => void;
  look: AimLookId;
  onLook: (look: AimLookId) => void;
  thoughts: boolean;
  onThoughts: (shown: boolean) => void;
  className: string | undefined;
  watching: boolean;
  onResume: () => void;
  onRestart: () => void;
  onClass: () => void;
  onWatch: () => void;
}) {
  loadMenuFont();

  return (
    <div class="tk-menu absolute inset-0 grid place-items-center" onClick={() => props.onResume()}>
      <style>{MENU_CSS}</style>
      <div class="tk-sheet" onClick={(event) => event.stopPropagation()}>
        <header class="tk-head">
          <div class="tk-title">PAUSED</div>
          <div class="tk-subtitle">
            <span>TANKI</span>
            <span>KING OF THE HILL</span>
          </div>
          <div class="tk-wedge" />
          <div class="tk-disc" />
        </header>
        <div class="tk-body">
          <div class="tk-column">
            <Section number="01" title="Match" />
            <Action label="Resume" hint="back to the fight" keyName="Esc" primary onClick={() => props.onResume()} />
            <Action label="Restart" hint="a new match" keyName="R" onClick={() => props.onRestart()} />
            <Action
              label="Class"
              hint={props.className ?? '—'}
              keyName="C"
              disabled={props.watching}
              onClick={() => props.onClass()}
            />
            <Action
              label={props.watching ? 'Take the tank' : 'Watch bots'}
              hint={props.watching ? 'play again' : 'a bot drives'}
              keyName="V"
              onClick={() => props.onWatch()}
            />
            <Section number="02" title="View" />
            <div class="tk-row">
              <span class="tk-label">Aim</span>
              <div class="tk-segments">
                <For each={AIM_LOOK_IDS}>
                  {(id) => (
                    <button class={['tk-segment', { 'tk-on': props.look === id }]} onClick={() => props.onLook(id)}>
                      {AIM_LOOKS[id].name}
                    </button>
                  )}
                </For>
              </div>
              <kbd class="tk-key">X</kbd>
            </div>
            <div class="tk-row">
              <span class="tk-label">Bot thoughts</span>
              <button
                class={['tk-switch', { 'tk-on': props.thoughts || props.watching }]}
                disabled={props.watching}
                onClick={() => props.onThoughts(!props.thoughts)}
              >
                <span class="tk-switch-off">Off</span>
                <span class="tk-switch-on">On</span>
              </button>
              <kbd class="tk-key">B</kbd>
            </div>
          </div>
          <div class="tk-column tk-pace">
            <Section number="03" title="Pace">
              <button class="tk-reset" onClick={() => props.onPace({ ...PACE_DEFAULTS })}>
                Reset
              </button>
            </Section>
            <For each={PACE_KNOBS}>{(knob) => <Knob knob={knob} pace={props.pace} onPace={props.onPace} />}</For>
            <div class="tk-derived">{derivedPace(props.pace)}</div>
          </div>
        </div>
        <footer class="tk-keys">
          <Section number="04" title="Keys" />
          <div class="tk-key-grid">
            <For each={KEYS}>
              {([keys, action]) => (
                <div class="tk-key-line">
                  <span class="tk-key-names">{keys}</span>
                  <span>{action}</span>
                </div>
              )}
            </For>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** A numbered section heading on a black rule, with anything in `children` at its right end. */
function Section(props: { number: string; title: string; children?: JSX.Element }) {
  return (
    <div class="tk-section">
      <span class="tk-number">{props.number}</span>
      <span class="tk-section-title">{props.title}</span>
      <span class="tk-rule" />
      {props.children}
    </div>
  );
}

/** A big button for a match action, with a short note under its label and its key at the right. */
function Action(props: {
  label: string;
  hint: string;
  keyName: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={['tk-action', { 'tk-primary': props.primary }]}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <span class="tk-action-text">
        <span class="tk-action-label">{props.label}</span>
        <span class="tk-action-hint">{props.hint}</span>
      </span>
      <kbd class="tk-key">{props.keyName}</kbd>
    </button>
  );
}

/** A slider for one pace knob, with a notch at the knob's default and its value, yellow while it differs from the default. */
function Knob(props: { knob: (typeof PACE_KNOBS)[number]; pace: Pace; onPace: (pace: Pace) => void }) {
  const value = () => props.pace[props.knob.key];
  const share = (at: number) => (at - props.knob.min) / (props.knob.max - props.knob.min);
  const changed = () => value() !== PACE_DEFAULTS[props.knob.key];

  return (
    <label class="tk-knob">
      <span class="tk-label">{props.knob.label}</span>
      <span class="tk-slider" style={{ '--fill': share(value()), '--notch': share(PACE_DEFAULTS[props.knob.key]) }}>
        <span class="tk-notch" />
        <input
          type="range"
          class="tk-range"
          min={props.knob.min}
          max={props.knob.max}
          step={props.knob.step}
          value={value()}
          onInput={(event) => props.onPace({ ...props.pace, [props.knob.key]: Number(event.currentTarget.value) })}
        />
      </span>
      <span class={['tk-value', { 'tk-changed': changed() }]}>
        {`${value().toFixed(props.knob.step < 1 ? 2 : 0)}${props.knob.unit}`}
      </span>
    </label>
  );
}

/** What the pace makes of the medium tank, its shell and the bots' reaction, in real time. */
function derivedPace(pace: Pace) {
  const drive = MEDIUM_TANK.speed * pace.tankSpeed * pace.speed;
  const shell = MEDIUM_TANK.shell.speed * pace.shellSpeed * pace.speed;
  const react = (seconds: number) => ((seconds * pace.botReaction) / pace.speed).toFixed(2);
  return `Medium tank ${Math.round(drive)} px/s · its shell ${Math.round(shell)} px/s · bots react in ${react(0.25)}–${react(0.5)} s`;
}

/** What the keys do in play, as the keys and the action. */
const KEYS: readonly (readonly [string, string])[] = [
  ['WASD', 'drive'],
  ['Mouse', 'aim; the view looks ahead'],
  ['LMB · Space', 'fire while held'],
  ['Sniper', 'hold to charge, let go'],
  ['RMB · Shift', 'turn on the spot'],
  ['Q · E', 'turn the view'],
  ['Wheel · + −', 'zoom'],
  ['1–5 · C', 'class'],
  ['V then 1–8 · 0', 'follow a tank · map']
];

/**
 * Adds the menu's condensed typeface, Oswald, to the page once. Without the network the menu
 * falls back to the system's narrow faces.
 */
function loadMenuFont() {
  if (document.getElementById(FONT_LINK_ID)) {
    return;
  }

  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&display=swap';
  document.head.append(link);
}

const FONT_LINK_ID = 'tanki-menu-font';

/**
 * The menu's look. Paper, ink and the teams' red and blue; every box has a black border and a
 * hard shadow that a pressed button sinks into. Range inputs need their own pseudo-elements,
 * hence a style sheet rather than utility classes.
 */
const MENU_CSS = `
.tk-menu {
  --ink: #141414; --paper: #efe7d4; --paper-light: #fbf6ea; --red: #e0321e; --blue: #2c5fd4; --yellow: #f2c418;
  font-family: Oswald, 'Arial Narrow', 'Helvetica Neue', Impact, sans-serif;
  color: var(--ink);
  background:
    repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.16) 0 2px, transparent 2px 10px),
    rgba(18, 18, 18, 0.5);
}
.tk-sheet {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: var(--paper);
  border: 3px solid var(--ink);
  box-shadow: 10px 10px 0 var(--ink);
}
.tk-head { position: relative; height: 64px; overflow: hidden; background: var(--ink); color: var(--paper-light); }
.tk-title { position: absolute; left: 18px; top: 2px; z-index: 1; font-size: 46px; font-weight: 700; letter-spacing: 0.06em; line-height: 1.2; }
.tk-subtitle { position: absolute; left: 226px; top: 15px; z-index: 1; display: flex; flex-direction: column; font-size: 12px; font-weight: 500; letter-spacing: 0.24em; line-height: 1.35; white-space: nowrap; }
.tk-subtitle > :first-child { color: var(--red); font-weight: 700; }
.tk-wedge { position: absolute; right: 0; top: 0; width: 330px; height: 64px; background: var(--red); clip-path: polygon(0 100%, 100% 0, 100% 100%); }
.tk-disc { position: absolute; right: 28px; top: 10px; width: 30px; height: 30px; border-radius: 50%; background: var(--paper-light); border: 3px solid var(--ink); }
.tk-body { display: grid; grid-template-columns: 290px 1fr; gap: 22px; padding: 14px 18px 6px; }
.tk-column { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.tk-section { display: flex; align-items: center; gap: 8px; margin: 4px 0 2px; text-transform: uppercase; }
.tk-number { background: var(--red); color: var(--paper-light); font-size: 12px; font-weight: 700; padding: 0 5px; border: 2px solid var(--ink); line-height: 1.35; }
.tk-section-title { font-size: 17px; font-weight: 700; letter-spacing: 0.1em; }
.tk-rule { flex: 1; height: 3px; background: var(--ink); }
.tk-menu button { font: inherit; color: inherit; cursor: pointer; }
.tk-action {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 4px 8px 4px 12px; text-align: left;
  background: var(--paper-light); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink);
  transition: transform 70ms, box-shadow 70ms;
}
.tk-action:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: 5px 5px 0 var(--ink); }
.tk-action:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: 1px 1px 0 var(--ink); }
.tk-action:disabled { opacity: 0.4; cursor: default; }
.tk-primary { background: var(--red); color: var(--paper-light) !important; }
.tk-action-text { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.tk-action-label { font-size: 21px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.3; white-space: nowrap; }
.tk-action-hint { font-size: 12px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tk-key {
  font-family: inherit; font-size: 11px; font-weight: 700; min-width: 22px; text-align: center;
  padding: 0 4px; line-height: 18px; background: var(--paper-light); color: var(--ink);
  border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); text-transform: uppercase;
}
.tk-row { display: flex; align-items: center; gap: 8px; }
.tk-label { flex: 0 0 auto; width: 96px; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
.tk-segments { flex: 1; display: flex; border: 3px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); }
.tk-segment { flex: 1; padding: 1px 6px; font-size: 13px !important; font-weight: 500; text-transform: uppercase; background: var(--paper-light); border: 0; border-left: 2px solid var(--ink); }
.tk-segment:first-child { border-left: 0; }
.tk-segment.tk-on { background: var(--ink); color: var(--paper-light) !important; }
.tk-switch { flex: 1; display: flex; padding: 0; border: 3px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); background: var(--paper-light); }
.tk-switch > span { flex: 1; padding: 1px 0; font-size: 13px; font-weight: 500; text-transform: uppercase; text-align: center; }
.tk-switch-off { background: var(--ink); color: var(--paper-light); }
.tk-switch.tk-on .tk-switch-off { background: transparent; color: var(--ink); }
.tk-switch.tk-on .tk-switch-on { background: var(--blue); color: var(--paper-light); }
.tk-switch:disabled { opacity: 0.4; cursor: default; }
.tk-reset {
  font-size: 12px !important; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0 8px; line-height: 20px; background: var(--yellow); border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink);
}
.tk-reset:active { transform: translate(2px, 2px); box-shadow: none; }
.tk-knob { display: flex; align-items: center; gap: 8px; height: 26px; }
.tk-slider { position: relative; flex: 1; min-width: 0; height: 22px; }
.tk-notch { position: absolute; top: 0; width: 3px; height: 5px; margin-left: -1.5px; background: var(--ink); left: calc(7px + (100% - 14px) * var(--notch)); }
.tk-range {
  position: absolute; inset: 0; width: 100%; height: 22px; margin: 0;
  -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer;
}
.tk-range:focus { outline: none; }
.tk-range::-webkit-slider-runnable-track {
  height: 8px; border: 2px solid var(--ink);
  background: linear-gradient(to right, var(--ink) calc(7px + (100% - 14px) * var(--fill)), var(--paper-light) 0);
}
.tk-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 20px; margin-top: -8px;
  background: var(--red); border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink);
}
.tk-range:focus-visible::-webkit-slider-thumb { background: var(--yellow); }
.tk-range::-moz-range-track { height: 4px; border: 2px solid var(--ink); background: var(--paper-light); }
.tk-range::-moz-range-progress { height: 4px; border: 2px solid var(--ink); background: var(--ink); }
.tk-range::-moz-range-thumb { width: 10px; height: 16px; border-radius: 0; background: var(--red); border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); }
.tk-value {
  flex: 0 0 auto; width: 58px; text-align: right; font-size: 14px; font-weight: 700;
  font-variant-numeric: tabular-nums; padding: 0 4px; line-height: 20px; border: 2px solid transparent;
}
.tk-value.tk-changed { background: var(--yellow); border-color: var(--ink); }
.tk-derived { margin-top: 2px; font-size: 11.5px; line-height: 1.35; opacity: 0.75; }
.tk-keys { padding: 4px 18px 14px; }
.tk-key-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 18px; margin-top: 4px; }
.tk-key-line { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; white-space: nowrap; overflow: hidden; }
.tk-key-names { flex: 0 0 auto; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
`;
