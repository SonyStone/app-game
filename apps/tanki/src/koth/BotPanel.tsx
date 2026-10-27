import { createMemo, For, Show } from 'solid-js';
import { DEBUG_LAYERS, explainDecision, type DebugLayer, type MemberReport } from './botDebug';
import { useKothI18n } from './i18n/i18n';
import './poster.css';

/**
 * The replay's bot panel, a panel of its dock: what the picked member has in mind, with switches
 * for the layers the arena shows of it (see `DEBUG_LAYERS`).
 *
 * Its thought, the goal, the plan with the step under way, the action and the enemy and ally it
 * is about; the enemies it sees and whether its gun would fire, as each of a shot's conditions
 * holds; its facts; why it chose its plan, as the planner answered when it made it (see
 * `explainDecision`): every goal by priority with the cheapest plan to it and that plan's cost,
 * the one chosen lit, every action's price and the estimates they came from; and what its team's
 * board says of it. Goals, actions and facts keep their names in the code.
 *
 * @param report - The member picked, as it stands, or `undefined` while none is.
 * @param layers - The layers shown; `onLayers` asks for others.
 */
export function BotPanel(props: { report: MemberReport | undefined; layers: ReadonlySet<DebugLayer>; onLayers: (layers: ReadonlySet<DebugLayer>) => void }) {
  const { t } = useKothI18n();
  const decision = createMemo(() => props.report?.decision);
  const why = createMemo(() => {
    const made = decision();
    return made && explainDecision(made.situation);
  });

  return (
    <div class="tk-bot-panel">
      <div class="tk-bot-layers">
        <For each={DEBUG_LAYERS}>
          {(layer) => (
            <label class={['tk-bot-layer', { 'tk-on': props.layers.has(layer) }]}>
              <input type="checkbox" checked={props.layers.has(layer)} onChange={() => toggle(layer)} />
              {t(`debug.layers.${layer}`)}
            </label>
          )}
        </For>
      </div>
      <Show when={props.report} fallback={<p class="tk-note px-2.5 py-2">{t('debug.pick')}</p>}>
        {(report) => (
          <div class="flex flex-col gap-2 px-2.5 pt-2 pb-4">
            <div class="tk-bot-who" style={{ '--team': report().team === 'red' ? '#c9473b' : '#3b73c9' }}>
              <b>{report().name}</b> · {t(`tankClass.${report().tankClass}`)} · {report().role}
              <span class="tk-note">
                {' '}
                · {report().alive ? t('debug.armor', Math.round(report().armor * 100)) : t('debug.dead')}
                {report().coreOpen ? ` · ${t('debug.coreOpen')}` : ''}
              </span>
            </div>
            <Show when={report().bot} fallback={<p class="tk-note">{t('debug.player')}</p>}>
              <Heading text={t('debug.thought')} />
              <div class="tk-bot-line">
                <b>{report().goal ?? '—'}</b>
                {' → '}
                <For each={report().steps}>
                  {(step, index) => (
                    <>
                      <span class={{ 'tk-bot-current': index() === report().step }}>{step}</span>
                      {index() < report().steps.length - 1 ? ' → ' : ''}
                    </>
                  )}
                </For>
              </div>
              <div class="tk-bot-line tk-note">
                {report().action ?? '—'}
                {report().target ? ` · ⌖ ${report().target}` : ''}
                {report().covering ? ` · ⛨ ${report().covering}` : ''}
                {report().breach ? ` · ${report().breach}` : ''}
              </div>
              <div class="tk-bot-line">
                <span class="tk-note">{t('debug.sees')}: </span>
                {report().sees.join(', ') || '—'}
              </div>
              <Show when={report().aim}>
                {(aim) => (
                  <div class="tk-bot-line">
                    <span class="tk-note">{t('debug.gun')}: </span>
                    {aim().target}{' '}
                    <For each={SHOT_CONDITIONS}>
                      {(condition) => <span class={['tk-bot-chip', { 'tk-off': !aim().shot?.[condition] }]}>{t(`debug.shot.${condition}`)}</span>}
                    </For>
                  </div>
                )}
              </Show>
              <Heading text={t('debug.facts')} />
              <div class="flex flex-wrap gap-1">
                <For each={report().facts}>{(fact) => <span class="tk-bot-chip">{fact}</span>}</For>
              </div>
              <Show when={why()}>
                {(explained) => (
                  <>
                    <Heading text={t('debug.why')} note={report().ago === undefined ? undefined : t('debug.planned', report().ago!.toFixed(1))} />
                    <div class="tk-note">{t('debug.goals')}</div>
                    <table class="tk-bot-table">
                      <tbody>
                        <For each={explained().goals}>
                          {(goal) => (
                            <tr class={{ 'tk-bot-chosen': goal.chosen, 'tk-off': goal.done || goal.steps === undefined }}>
                              <td class="text-right">{Math.round(goal.priority)}</td>
                              <td>
                                <b>{goal.name}</b>
                                <div class="tk-note">{goal.wants.join(' ')}</div>
                              </td>
                              <td>{goal.done ? t('debug.holds') : goal.steps ? goal.steps.join(' → ') : t('debug.noPlan')}</td>
                              <td class="text-right">{goal.cost === undefined ? '' : seconds(goal.cost)}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                    <div class="tk-note">{t('debug.actions')}</div>
                    <div class="tk-bot-pairs">
                      <For each={explained().actions}>
                        {(action) => (
                          <span class={{ 'tk-off': !Number.isFinite(action.cost) }}>
                            {action.name} <b>{seconds(action.cost)}</b>
                          </span>
                        )}
                      </For>
                    </div>
                    <div class="tk-note">{t('debug.estimates')}</div>
                    <div class="tk-bot-pairs">
                      <For each={Object.entries(explained().estimates)}>
                        {([name, value]) => (
                          <span class={{ 'tk-off': !Number.isFinite(value) }}>
                            {name} <b>{seconds(value)}</b>
                          </span>
                        )}
                      </For>
                    </div>
                  </>
                )}
              </Show>
            </Show>
            <Heading text={t('debug.team')} />
            <div class="tk-bot-pairs">
              <span>
                {t('debug.intent')} <b>{report().board.intent}{report().board.phase === 'none' ? '' : ` · ${report().board.phase}`}</b>
              </span>
              <span>
                {t('debug.focus')} <b>{report().board.focus ?? '—'}</b>
              </span>
              <Show when={report().board.help}>
                {(help) => (
                  <span>
                    {t('debug.help')} <b>{help().ally} ← {help().attacker ?? '—'}</b>
                  </span>
                )}
              </Show>
              <Show when={report().board.job}>
                {(job) => (
                  <span>
                    {t('debug.job')} <b>{job()}</b>
                  </span>
                )}
              </Show>
              <Show when={report().board.kit}>
                {(kit) => (
                  <span>
                    {t('debug.kit')} <b>{seconds(Math.max(kit().eta, 0))}</b>
                  </span>
                )}
              </Show>
              <Show when={report().board.perch}>
                <span>
                  <b>{t('debug.perch')}</b>
                  {report().board.fallenBack ? ` · ${t('debug.unsafe')}` : ''}
                </span>
              </Show>
              <Show when={report().board.lookout}>
                <b>{t('debug.lookout')}</b>
              </Show>
              <Show when={report().board.breaching}>{(lane) => <b>breach · {lane()}</b>}</Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  );

  function toggle(layer: DebugLayer) {
    const next = new Set(props.layers);

    if (next.has(layer)) {
      next.delete(layer);
    } else {
      next.add(layer);
    }

    props.onLayers(next);
  }
}

/** A section's heading on a rule, with a note at its right. */
function Heading(props: { text: string; note?: string }) {
  return (
    <div class="tk-bot-heading">
      <span>{props.text}</span>
      <i />
      <Show when={props.note}>
        <span class="tk-note">{props.note}</span>
      </Show>
    </div>
  );
}

/** What must hold for a bot's gun to fire, in the order the panel lists them. */
const SHOT_CONDITIONS = ['reacted', 'aligned', 'worth', 'clear', 'inReach'] as const;

/** Seconds to a tenth, or ∞. */
function seconds(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '∞';
}
