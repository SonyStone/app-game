import { Show } from 'solid-js';
import type { ToolMode } from '../../shared/toolMode';

/** Shows the size for the current tool, with opacity for drawing tools. */
export function BrushControls(props: BrushControlsProps) {
  return (
    <div class="brush-sliders">
      <label class="range-control">
        <span>
          {props.mode === 'erase' ? 'Eraser size' : 'Size'}
          <output>{(props.mode === 'erase' ? props.eraserRadius : props.strokeRadius).toFixed(3)}</output>
        </span>
        <input
          type="range"
          min={props.mode === 'erase' ? 0.06 : 0.015}
          max={props.mode === 'erase' ? 0.5 : 0.12}
          step={props.mode === 'erase' ? 0.01 : 0.005}
          aria-label={props.mode === 'erase' ? 'Eraser size' : 'Brush size'}
          value={props.mode === 'erase' ? props.eraserRadius : props.strokeRadius}
          onInput={(event) =>
            (props.mode === 'erase' ? props.onSetEraserRadius : props.onSetStrokeRadius)(
              event.currentTarget.valueAsNumber
            )
          }
        />
      </label>
      <Show when={props.mode !== 'erase'}>
        <label class="range-control">
          <span>
            Opacity<output>{Math.round(props.brushStrength * 100)}%</output>
          </span>
          <input
            name="brush-strength"
            aria-label="Brush opacity"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={props.brushStrength}
            onInput={(event) => props.onSetBrushStrength(event.currentTarget.valueAsNumber)}
          />
        </label>
      </Show>
    </div>
  );
}

type BrushControlsProps = {
  mode: ToolMode;
  strokeRadius: number;
  brushStrength: number;
  eraserRadius: number;
  onSetStrokeRadius: (radius: number) => void;
  onSetBrushStrength: (strength: number) => void;
  onSetEraserRadius: (radius: number) => void;
};
