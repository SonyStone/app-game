import { type JSX } from 'solid-js';
import { AnimationControls } from './AnimationControls';

export type GridControlsProps = {
  columns: number;
  setColumns: (v: number) => void;
  animEnabled?: boolean;
  setAnimEnabled?: (v: boolean) => void;
  animDuration: number;
  setAnimDuration: (v: number) => void;
  isAnimating: boolean;
  debugEnabled?: boolean;
  setDebugEnabled?: (v: boolean) => void;
};

export function GridControls(props: GridControlsProps): JSX.Element {
  return (
    <div class="flex flex-wrap items-center gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <label class="flex items-center gap-2 text-xs text-neutral-400">
        Columns
        <input
          type="range"
          min="2"
          max="6"
          step="1"
          value={props.columns}
          onInput={(e) => props.setColumns(Number(e.currentTarget.value))}
          class="h-1 w-20 cursor-pointer accent-blue-500"
        />
        <span class="w-4 font-mono text-neutral-300">{props.columns}</span>
      </label>

      <AnimationControls
        bare
        enabled={props.animEnabled}
        setEnabled={props.setAnimEnabled}
        duration={props.animDuration}
        setDuration={props.setAnimDuration}
        isAnimating={props.isAnimating}
        debugEnabled={props.debugEnabled}
        setDebugEnabled={props.setDebugEnabled}
      />
    </div>
  );
}
