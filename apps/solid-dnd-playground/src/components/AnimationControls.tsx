import { Show, type JSX } from 'solid-js';

export type AnimationControlsProps = {
  enabled?: boolean;
  setEnabled?: (v: boolean) => void;
  duration: number;
  setDuration: (v: number) => void;
  isAnimating: boolean;
  debugEnabled?: boolean;
  setDebugEnabled?: (v: boolean) => void;
  /**
   * When true, renders only the inner controls without the wrapper div.
   * Useful for composing inside another container (e.g., GridControls).
   */
  bare?: boolean;
};

// ============================================================================
// MARK: AnimationControls
// ============================================================================

export function AnimationControls(props: AnimationControlsProps): JSX.Element {
  const inner = (
    <>
      <Show when={props.setEnabled !== undefined}>
        <label class="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={props.enabled}
            onChange={(e) => props.setEnabled?.(e.currentTarget.checked)}
            class="accent-blue-500"
          />
          FLIP animation
        </label>
      </Show>

      <label class="flex items-center gap-2 text-xs text-neutral-400">
        Duration
        <input
          type="range"
          min="50"
          max="800"
          step="10"
          value={props.duration}
          onInput={(e) => props.setDuration(Number(e.currentTarget.value))}
          class="h-1 w-24 cursor-pointer accent-blue-500"
          disabled={props.enabled === false}
        />
        <span class="w-12 font-mono text-neutral-300">{props.duration}ms</span>
      </label>

      <Show when={props.setDebugEnabled !== undefined}>
        <label class="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={props.debugEnabled}
            onChange={(e) => props.setDebugEnabled?.(e.currentTarget.checked)}
            class="accent-yellow-500"
          />
          FLIP debug
        </label>
      </Show>

      <Show when={props.isAnimating}>
        <span class="text-xs text-blue-400">⟳ animating…</span>
      </Show>
    </>
  );

  if (props.bare) return inner;

  return (
    <div class="flex flex-wrap items-center gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">{inner}</div>
  );
}
