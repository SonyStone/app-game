import { For } from 'solid-js';
import { PACE_DEFAULTS, PACE_KNOBS, type Pace } from './pace';
import { MEDIUM_TANK } from './tanks';

/**
 * A small panel of the match's pace knobs (see `Pace`), for finding the tempo by feel: a slider
 * for each, which takes effect at once, a value that turns yellow while it differs from the
 * default, and what the knobs make of the medium tank, its shell and the bots. Reset puts every
 * knob back to its default.
 *
 * @param onChange - Receives the whole pace after a knob moved or the reset.
 */
export function PacePanel(props: { pace: Pace; onChange: (pace: Pace) => void }) {
  const derived = () => {
    const pace = props.pace;
    const drive = MEDIUM_TANK.speed * pace.tankSpeed * pace.speed;
    const shell = MEDIUM_TANK.shell.speed * pace.shellSpeed * pace.speed;
    const react = (seconds: number) => ((seconds * pace.botReaction) / pace.speed).toFixed(2);
    return `Medium tank ${Math.round(drive)} px/s, its shell ${Math.round(shell)} px/s, bots react in ${react(0.25)}–${react(0.5)} s (real time)`;
  };

  return (
    <div class="absolute left-3 top-3 w-72 rounded bg-black/60 px-3 py-2 text-xs text-white">
      <div class="mb-1 flex items-center justify-between">
        <span class="font-bold">Pace · T hides</span>
        <button class="rounded border-0 bg-white/85 px-2 py-0.5 text-xs font-bold text-black" onClick={() => props.onChange({ ...PACE_DEFAULTS })}>
          Reset
        </button>
      </div>
      <For each={PACE_KNOBS}>
        {(knob) => {
          const value = () => props.pace[knob.key];

          return (
            <label class="flex items-center gap-2 py-0.5">
              <span class="w-20 shrink-0 text-white/75">{knob.label}</span>
              <input
                type="range"
                class="h-1 min-w-0 flex-1 accent-white"
                min={knob.min}
                max={knob.max}
                step={knob.step}
                value={value()}
                onInput={(event) => props.onChange({ ...props.pace, [knob.key]: Number(event.currentTarget.value) })}
              />
              <span class="w-14 shrink-0 text-right font-bold tabular-nums" style={{ color: value() === PACE_DEFAULTS[knob.key] ? undefined : '#ffd27a' }}>
                {`${value().toFixed(knob.step < 1 ? 2 : 0)}${knob.unit}`}
              </span>
            </label>
          );
        }}
      </For>
      <div class="mt-1 text-[10px] leading-snug text-white/55">{derived()}</div>
    </div>
  );
}
