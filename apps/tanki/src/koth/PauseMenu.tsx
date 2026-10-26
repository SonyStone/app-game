import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { AIM_LOOK_IDS, type AimLookId } from './AimOverlay';
import { LANGUAGES, useKothI18n } from './i18n/i18n';
import { PACE_DEFAULTS, PACE_KNOBS, type Pace } from './pace';
import './poster.css';
import { MEDIUM_TANK } from './tanks';

/**
 * The menu Esc opens over a paused match, drawn as a constructivist poster (see `poster.css`). It
 * holds what the keys do during play, so a test can be set up without remembering them:
 *
 * - The language, in the header.
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
  const { t, language, choose } = useKothI18n();
  const thoughtsOn = () => props.thoughts || props.watching;

  return (
    <div class="tk-backdrop absolute inset-0 grid place-items-center" onClick={() => props.onResume()}>
      <div class="tk-sheet w-[780px]" onClick={(event) => event.stopPropagation()}>
        <header class="tk-head">
          <div class="tk-wedge" />
          <div class="tk-disc" />
          <div class="tk-title">{t('menu.paused')}</div>
          <div class="tk-subtitle">
            <span>{t('title.game')}</span>
            <span>{t('title.mode')}</span>
          </div>
          <div class="tk-segments tk-languages" role="group" aria-label={t('menu.language')}>
            <For each={LANGUAGES}>
              {(entry) => (
                <button
                  class={['tk-segment', { 'tk-on': language() === entry.id }]}
                  lang={entry.id}
                  title={entry.name}
                  onClick={() => choose(entry.id)}
                >
                  {entry.code}
                </button>
              )}
            </For>
          </div>
        </header>
        <div class="grid grid-cols-[300px_1fr] gap-[22px] px-[18px] pt-3.5 pb-1.5">
          <div class="flex min-w-0 flex-col gap-[7px]">
            <Section number="01" title={t('menu.match')} />
            <Action
              label={t('menu.resume')}
              hint={t('menu.resumeHint')}
              keyName="Esc"
              primary
              onClick={() => props.onResume()}
            />
            <Action
              label={t('menu.restart')}
              hint={t('menu.restartHint')}
              keyName="R"
              onClick={() => props.onRestart()}
            />
            <Action
              label={t('menu.class')}
              hint={props.className ?? '—'}
              keyName="C"
              disabled={props.watching}
              onClick={() => props.onClass()}
            />
            <Action
              label={props.watching ? t('menu.takeTank') : t('menu.watch')}
              hint={props.watching ? t('menu.takeTankHint') : t('menu.watchHint')}
              keyName="V"
              onClick={() => props.onWatch()}
            />
            <Section number="02" title={t('menu.view')} />
            <div class="tk-row">
              <span class="tk-label">{t('menu.aim')}</span>
              <div class="tk-segments">
                <For each={AIM_LOOK_IDS}>
                  {(id) => (
                    <button class={['tk-segment', { 'tk-on': props.look === id }]} onClick={() => props.onLook(id)}>
                      {t(`look.${id}`)}
                    </button>
                  )}
                </For>
              </div>
              <kbd class="tk-key">X</kbd>
            </div>
            <div class="tk-row">
              <span class="tk-label">{t('menu.thoughts')}</span>
              <button
                class={['tk-segments tk-switch', { 'tk-on': thoughtsOn() }]}
                disabled={props.watching}
                onClick={() => props.onThoughts(!props.thoughts)}
              >
                <span class={{ 'tk-on': !thoughtsOn() }}>{t('menu.off')}</span>
                <span class={{ 'tk-on': thoughtsOn() }}>{t('menu.on')}</span>
              </button>
              <kbd class="tk-key">B</kbd>
            </div>
          </div>
          <div class="flex min-w-0 flex-col gap-[7px]">
            <Section number="03" title={t('menu.pace')}>
              <button class="tk-small-button" onClick={() => props.onPace({ ...PACE_DEFAULTS })}>
                {t('menu.reset')}
              </button>
            </Section>
            <div class="tk-knobs">
              <For each={PACE_KNOBS}>{(knob) => <Knob knob={knob} pace={props.pace} onPace={props.onPace} />}</For>
            </div>
            <div class="tk-note mt-0.5">{derivedPace(props.pace, t)}</div>
          </div>
        </div>
        <footer class="px-[18px] pt-1 pb-3.5">
          <Section number="04" title={t('menu.keys')} />
          <div class="tk-key-grid">
            <For each={KEY_IDS}>
              {(id) => (
                <div class="tk-key-line">
                  <span class="tk-key-names">{t(`keys.${id}`)[0]}</span>
                  <span>{t(`keys.${id}`)[1]}</span>
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

/** A big button for a match action, with a short note after its label and its key at the right. */
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

/**
 * A slider for one pace knob, in the three columns of `.tk-knobs`: its name, the slider with a
 * notch at the knob's default, and its value, yellow while it differs from the default.
 */
function Knob(props: { knob: (typeof PACE_KNOBS)[number]; pace: Pace; onPace: (pace: Pace) => void }) {
  const { t } = useKothI18n();
  const value = () => props.pace[props.knob.key];
  const share = (at: number) => (at - props.knob.min) / (props.knob.max - props.knob.min);
  const changed = () => value() !== PACE_DEFAULTS[props.knob.key];

  return (
    <label class="tk-knob">
      <span class="tk-label">{t(`knob.${props.knob.key}`)}</span>
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
function derivedPace(pace: Pace, t: ReturnType<typeof useKothI18n>['t']) {
  const drive = MEDIUM_TANK.speed * pace.tankSpeed * pace.speed;
  const shell = MEDIUM_TANK.shell.speed * pace.shellSpeed * pace.speed;
  const react = (seconds: number) => ((seconds * pace.botReaction) / pace.speed).toFixed(2);
  return t('menu.derived', Math.round(drive), Math.round(shell), react(0.25), react(0.5));
}

/** The lines of the key list, in its order; each is a pair of keys and action under `keys` in the dictionary. */
const KEY_IDS = ['drive', 'aim', 'fire', 'charge', 'turn', 'view', 'zoom', 'class', 'follow'] as const;
