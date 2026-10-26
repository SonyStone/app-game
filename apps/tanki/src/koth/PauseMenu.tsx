import { For, Match, Switch } from 'solid-js';
import { AIM_LOOK_IDS, type AimLookId } from './AimOverlay';
import { ClassEditor } from './classes/ClassEditor';
import { CLASS_KNOBS, knobValue } from './classes/knobs';
import { LANGUAGES, useKothI18n } from './i18n/i18n';
import { PACE_DEFAULTS, PACE_KNOBS, type Pace } from './pace';
import './poster.css';
import { KnobSlider, Section } from './PosterParts';
import type { TankClassId } from './tanks';
import type { TuningControls } from './tuning';

/**
 * The menu Esc opens over a paused match, drawn as a constructivist poster (see `poster.css`), in
 * two pages picked in its header. The menu page holds what the keys do during play, so a test can
 * be set up without remembering them:
 *
 * - The language, in the header.
 * - The match: resume, restart, the class menu, and watching the bots or taking the tank back.
 * - The view: the aim's look and the bots' thoughts.
 * - The pace knobs (see `Pace`), which take effect at once: a slider for each with a notch at its
 *   default, a value that turns yellow while it differs from it, what the knobs make of the medium
 *   tank, its shell and the bots, and a reset that puts every knob back.
 * - What every key does.
 *
 * The classes page is the class editor (see `ClassEditor`), where the tuning is also shared.
 *
 * A click outside the menu resumes. Each action names its key, which does the same in play.
 *
 * @param tuning - The route's tuning: the pace knobs and the class editor change it.
 * @param page - The page shown; `onPage` asks for another.
 * @param playerClass - The player's class, on the class button and picked first in the class editor.
 * @param thoughts - Whether the bots' thoughts are shown in play; watching shows them regardless, and the switch is off limits then.
 * @param watching - Whether the player is watching the bots, which turns the watch button into taking the tank back.
 */
export function PauseMenu(props: {
  tuning: TuningControls;
  page: MenuPage;
  onPage: (page: MenuPage) => void;
  playerClass: TankClassId | undefined;
  look: AimLookId;
  onLook: (look: AimLookId) => void;
  thoughts: boolean;
  onThoughts: (shown: boolean) => void;
  watching: boolean;
  onResume: () => void;
  onRestart: () => void;
  onClass: () => void;
  onWatch: () => void;
}) {
  const { t, language, choose } = useKothI18n();
  const thoughtsOn = () => props.thoughts || props.watching;
  const pace = () => props.tuning.pace();
  const onPace = (next: Pace) => props.tuning.setPace(next);

  return (
    <div class="tk-backdrop absolute inset-0 grid place-items-center" onClick={() => props.onResume()}>
      <div
        class={['tk-sheet', props.page === 'classes' ? 'w-[1060px]' : 'w-[780px]']}
        onClick={(event) => event.stopPropagation()}
      >
        <header class="tk-head">
          <div class="tk-wedge" />
          <div class="tk-disc" />
          <div class="tk-title">{t('menu.paused')}</div>
          <div class="tk-subtitle">
            <span>{t('title.game')}</span>
            <span>{t('title.mode')}</span>
          </div>
          <div class="tk-segments tk-tabs" role="tablist">
            <For each={MENU_PAGES}>
              {(page) => (
                <button
                  class={['tk-segment', { 'tk-on': props.page === page }]}
                  role="tab"
                  aria-selected={props.page === page ? 'true' : 'false'}
                  onClick={() => props.onPage(page)}
                >
                  {t(`menu.pages.${page}`)}
                </button>
              )}
            </For>
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
        <Switch>
          <Match when={props.page === 'classes'}>
            <ClassEditor tuning={props.tuning} initial={props.playerClass ?? 'soldier'} />
          </Match>
          <Match when={props.page === 'menu'}>
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
                  hint={props.playerClass ? t(`tankClass.${props.playerClass}`) : '—'}
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
                  <button class="tk-small-button" onClick={() => onPace({ ...PACE_DEFAULTS })}>
                    {t('menu.reset')}
                  </button>
                </Section>
                <div class="tk-knobs">
                  <For each={PACE_KNOBS}>
                    {(knob) => (
                      <KnobSlider
                        label={t(`knob.${knob.key}`)}
                        value={pace()[knob.key]}
                        defaultValue={PACE_DEFAULTS[knob.key]}
                        min={knob.min}
                        max={knob.max}
                        step={knob.step}
                        text={`${pace()[knob.key].toFixed(knob.step < 1 ? 2 : 0)}${knob.unit}`}
                        onChange={(value) => onPace({ ...pace(), [knob.key]: value })}
                      />
                    )}
                  </For>
                </div>
                <div class="tk-note mt-0.5">{derivedPace(pace(), props.tuning, t)}</div>
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
          </Match>
        </Switch>
      </div>
    </div>
  );
}

/** The pages of the pause menu, in the order of its header. */
export const MENU_PAGES = ['menu', 'classes'] as const;

/** One of `MENU_PAGES`. */
export type MenuPage = (typeof MENU_PAGES)[number];

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

/** What the pace makes of the medium tank, as the class editor has it, its shell and the bots' reaction, in real time. */
function derivedPace(pace: Pace, tuning: TuningControls, t: ReturnType<typeof useKothI18n>['t']) {
  const soldier = (id: 'speed' | 'shellSpeed') =>
    knobValue(tuning.classes(), 'soldier', CLASS_KNOBS.find((knob) => knob.id === id)!);
  const drive = soldier('speed') * pace.tankSpeed * pace.speed;
  const shell = soldier('shellSpeed') * pace.shellSpeed * pace.speed;
  const react = (seconds: number) => ((seconds * pace.botReaction) / pace.speed).toFixed(2);
  return t('menu.derived', Math.round(drive), Math.round(shell), react(0.25), react(0.5));
}

/** The lines of the key list, in its order; each is a pair of keys and action under `keys` in the dictionary. */
const KEY_IDS = ['drive', 'aim', 'fire', 'charge', 'turn', 'view', 'zoom', 'class', 'follow'] as const;
