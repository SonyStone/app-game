import { For } from 'solid-js';

import { useI18n } from '../../i18n/I18nProvider';
import { pathCommandLetters } from '../../path-data';

/**
 * GodSVG's path command picker for inserting after a command: the ten commands (absolute or, with "Relative",
 * lowercase), some disabled or flagged as unusual after `previous` / before `next` (see `insertCommandStates`), and
 * "Keep open" — when off, holding Shift or Ctrl while picking keeps the picker open. `pick` receives the letter and
 * whether to stay open.
 */
export function PathInsertPopup(props: {
  readonly previous: string | undefined;
  readonly next: string | undefined;
  readonly relative: boolean;
  readonly setRelative: (relative: boolean) => void;
  readonly keepOpen: boolean;
  readonly setKeepOpen: (keepOpen: boolean) => void;
  readonly pick: (letter: string, stayOpen: boolean) => void;
}) {
  const { t } = useI18n();
  const states = () => insertCommandStates(props.previous, props.next);

  return (
    <div class="grid gap-1" data-testid="path-insert-popup">
      <div class="grid grid-cols-5 gap-0.75">
        <For each={pathCommandLetters}>
          {(letter) => {
            const state = () => states()[letter];
            const shown = () => (props.relative ? letter.toLowerCase() : letter);

            return (
              <button
                type="button"
                class={[
                  "grid h-6 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] hover:border-[var(--accent)] disabled:cursor-default disabled:opacity-40",
                  { 'text-[var(--warning)]': state() === 'warned' }
                ]}
                disabled={state() === 'disabled'}
                title={t(commandNames[letter] ?? letter)}
                data-testid={`path-insert-${letter}`}
                onClick={(event) => props.pick(shown(), props.keepOpen || event.shiftKey || event.ctrlKey || event.metaKey)}
              >
                {shown()}
              </button>
            );
          }}
        </For>
      </div>
      <label class="flex items-center gap-1.5 text-[11px]">
        <input
          type="checkbox"
          checked={props.relative}
          data-testid="path-insert-relative"
          onChange={(event) => props.setRelative(event.currentTarget.checked)}
        />
        {t('Relative')}
      </label>
      <label
        class="flex items-center gap-1.5 text-[11px]"
        title={t('If toggled off, you must hold {keys} when selecting a path command to keep the popup open.', { keys: 'Shift/Ctrl' })}
      >
        <input
          type="checkbox"
          checked={props.keepOpen}
          data-testid="path-insert-keep-open"
          onChange={(event) => props.setKeepOpen(event.currentTarget.checked)}
        />
        {t('Keep open')}
      </label>
    </div>
  );
}

/**
 * GodSVG's rules for inserting a command between `previous` and `next`: Z is impossible after a Z or before one; M is
 * unusual after an M or before a Z, Z right after an M, T after anything but Q/T, and S after anything but C/S.
 */
export function insertCommandStates(previous: string | undefined, next: string | undefined): Record<string, 'normal' | 'warned' | 'disabled'> {
  const before = previous?.toUpperCase() ?? '';
  const after = next?.toUpperCase() ?? '';
  const states: Record<string, 'normal' | 'warned' | 'disabled'> = Object.fromEntries(pathCommandLetters.map((letter) => [letter, 'normal']));
  states.M = before === 'M' || after === 'Z' ? 'warned' : 'normal';
  states.Z = before === 'Z' || after === 'Z' ? 'disabled' : before === 'M' ? 'warned' : 'normal';
  states.T = 'QT'.includes(before) && before !== '' ? 'normal' : 'warned';
  states.S = 'CS'.includes(before) && before !== '' ? 'normal' : 'warned';
  return states;
}

const commandNames: Readonly<Record<string, string>> = {
  M: 'Move to',
  L: 'Line to',
  H: 'Horizontal Line to',
  V: 'Vertical Line to',
  Z: 'Close Path',
  A: 'Elliptical Arc to',
  Q: 'Quadratic Bezier to',
  T: 'Shorthand Quadratic Bezier to',
  C: 'Cubic Bezier to',
  S: 'Shorthand Cubic Bezier to'
};
