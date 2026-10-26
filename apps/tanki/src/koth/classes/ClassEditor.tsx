import { createSignal, For, Show, untrack } from 'solid-js';
import { useKothI18n } from '../i18n/i18n';
import { KnobSlider, Section } from '../PosterParts';
import { TANK_CLASS_IDS, type TankClassId } from '../tanks';
import type { TuningControls } from '../tuning';
import {
  formatKnob,
  KNOB_GROUPS,
  knobDefault,
  knobRange,
  knobsOf,
  knobValue,
  type KnobGroup,
  type KnobTiming
} from './knobs';

/**
 * The class editor, the pause menu's second page, for trying other numbers for the classes by
 * hand: the five classes to pick from, a reset for the one picked and one for all, and the picked
 * class's knobs (see `CLASS_KNOBS`) in groups, movement, weapon, armor, the point and the bots,
 * each a slider with a notch at its default and a value that turns yellow while it differs from
 * it. A class with changes is marked. Most knobs take effect at once; those marked ↻ with the
 * tank's next respawn and those marked R with a restart, as the legend says. Below, the tuning,
 * pace and classes together, is shared (see `ShareTuning`).
 *
 * @param tuning - The route's tuning, which the knobs change.
 * @param initial - The class picked when the editor opens, the player's own.
 */
export function ClassEditor(props: { tuning: TuningControls; initial: TankClassId }) {
  const { t } = useKothI18n();
  const [edited, setEdited] = createSignal(untrack(() => props.initial));
  const changed = (id: TankClassId) => props.tuning.classes()[id] !== undefined;

  return (
    <div class="flex flex-col gap-[7px] px-[18px] pt-3.5 pb-3">
      <div class="tk-row">
        <div class="tk-segments tk-class-tabs" role="group" aria-label={t('menu.class')}>
          <For each={[...TANK_CLASS_IDS]}>
            {(id, index) => (
              <button class={['tk-segment', { 'tk-on': edited() === id }]} onClick={() => setEdited(id)}>
                <span class="tk-class-tab-key">{index() + 1}</span>
                {t(`tankClass.${id}`)}
                <Show when={changed(id)}>
                  <span class="tk-dot" title={t('classEditor.changed')} />
                </Show>
              </button>
            )}
          </For>
        </div>
        <button class="tk-small-button" disabled={!changed(edited())} onClick={() => props.tuning.resetClass(edited())}>
          {t('classEditor.resetClass')}
        </button>
        <button
          class="tk-small-button"
          disabled={Object.keys(props.tuning.classes()).length === 0}
          onClick={() => props.tuning.resetClasses()}
        >
          {t('classEditor.resetAll')}
        </button>
      </div>
      <div class="grid grid-cols-3 items-start gap-x-[22px]">
        <div class="flex min-w-0 flex-col gap-[5px]">
          <KnobGroupSliders group="move" id={edited()} tuning={props.tuning} />
          <KnobGroupSliders group="armor" id={edited()} tuning={props.tuning} />
          <KnobGroupSliders group="point" id={edited()} tuning={props.tuning} />
        </div>
        <div class="flex min-w-0 flex-col gap-[5px]">
          <KnobGroupSliders group="weapon" id={edited()} tuning={props.tuning} />
        </div>
        <div class="flex min-w-0 flex-col gap-[5px]">
          <KnobGroupSliders group="bot" id={edited()} tuning={props.tuning} />
        </div>
      </div>
      <div class="tk-note">
        {t('classEditor.legend.now')} · <LaterMark applies="respawn" /> {t('classEditor.legend.respawn')} ·{' '}
        <LaterMark applies="restart" /> {t('classEditor.legend.restart')} · {t('classEditor.legend.kept')}
      </div>
      <ShareTuning tuning={props.tuning} />
    </div>
  );
}

/**
 * The knobs of class `id` in `group` under the group's numbered heading, or nothing for a class
 * without any. A knob that takes effect later than at once is marked after its name.
 */
function KnobGroupSliders(props: { group: KnobGroup; id: TankClassId; tuning: TuningControls }) {
  const { t } = useKothI18n();
  const knobs = () => knobsOf(props.id).filter((knob) => knob.group === props.group);

  return (
    <Show when={knobs().length > 0}>
      <Section
        number={String(KNOB_GROUPS.indexOf(props.group) + 1).padStart(2, '0')}
        title={t(`knobGroup.${props.group}`)}
      />
      <div class="tk-knobs tk-knobs-compact">
        <For each={knobs()}>
          {(knob) => {
            const value = () => knobValue(props.tuning.classes(), props.id, knob);
            const range = () => knobRange(props.id, knob);

            return (
              <KnobSlider
                label={
                  <>
                    {t(`classKnob.${knob.id}`)}
                    <Show when={knob.applies !== 'now' && knob.applies}>
                      {(applies) => <LaterMark applies={applies()} title={t(`classEditor.${applies()}`)} />}
                    </Show>
                  </>
                }
                value={value()}
                defaultValue={knobDefault(props.id, knob)}
                min={range().min}
                max={range().max}
                step={range().step}
                text={`${formatKnob(knob, props.id, value())}${knob.unit ? t(`unit.${knob.unit}`) : ''}`}
                onChange={(next) => props.tuning.setKnob(props.id, knob, next)}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
}

/** The mark of a knob that takes effect later than at once: a circling arrow for the tank's next respawn, R for a restart. */
function LaterMark(props: { applies: Exclude<KnobTiming, 'now'>; title?: string }) {
  return (
    <span class="tk-later" title={props.title}>
      <Show when={props.applies === 'respawn'} fallback="R">
        <svg viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M8.2 5.4 A3.3 3.3 0 1 1 6.9 2.4" />
          <path d="M7.6 0.6 V3.1 H5.1" />
        </svg>
      </Show>
    </span>
  );
}

/**
 * The tuning shared as text: Export copies its JSON to the clipboard and shows it, Link does the
 * same with a link that opens the game with it, and Import takes a JSON, a link or a link's code
 * pasted in the box and makes it the tuning, telling what it left out. A clipboard the page may
 * not write to leaves the text selected in the box, to copy by hand.
 */
function ShareTuning(props: { tuning: TuningControls }) {
  const { t } = useKothI18n();
  const [shown, setShown] = createSignal<{ mode: 'export' | 'import'; text: string; note: string }>();
  let box: HTMLTextAreaElement | undefined;

  return (
    <>
      <Section number={String(KNOB_GROUPS.length + 1).padStart(2, '0')} title={t('classEditor.share')}>
        <button class="tk-small-button" onClick={() => void share(props.tuning.exportText())}>
          {t('classEditor.export')}
        </button>
        <button class="tk-small-button" onClick={() => void share(props.tuning.link())}>
          {t('classEditor.link')}
        </button>
        <button
          class="tk-small-button"
          onClick={() => {
            setShown({ mode: 'import', text: '', note: t('classEditor.paste') });
            queueMicrotask(() => box?.focus());
          }}
        >
          {t('classEditor.import')}
        </button>
      </Section>
      <Show when={shown()}>
        {(open) => (
          <div class="flex flex-col gap-[5px]">
            <textarea
              ref={(element) => (box = element)}
              class="tk-share-text"
              rows={5}
              spellcheck={false}
              value={open().text}
              placeholder={t('classEditor.paste')}
            />
            <div class="tk-row">
              <span class="tk-note min-w-0 flex-1">{open().note}</span>
              <Show when={open().mode === 'import'}>
                <button class="tk-small-button" onClick={() => apply()}>
                  {t('classEditor.apply')}
                </button>
              </Show>
              <button class="tk-small-button" onClick={() => setShown(undefined)}>
                {t('classEditor.close')}
              </button>
            </div>
          </div>
        )}
      </Show>
    </>
  );

  /** Shows `text` and copies it to the clipboard, or selects it to copy by hand. */
  async function share(text: string) {
    setShown({ mode: 'export', text, note: '' });
    const copied = await navigator.clipboard?.writeText(text).then(
      () => true,
      () => false
    );

    setShown({ mode: 'export', text, note: copied ? t('classEditor.copied') : t('classEditor.copyFailed') });

    if (!copied) {
      queueMicrotask(() => box?.select());
    }
  }

  /** Makes the tuning in the box the tuning now and tells how it went. */
  function apply() {
    const text = box?.value ?? '';
    const read = props.tuning.importText(text);
    const note =
      'error' in read
        ? t(`classEditor.error.${read.error}`)
        : t('classEditor.imported', read.dropped.length > 0 ? read.dropped.join(', ') : undefined);

    setShown({ mode: 'import', text, note });
  }
}
