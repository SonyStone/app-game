type BrushControlsProps = {
  strokeRadius: number
  brushStrength: number
  eraserRadius: number
  onSetStrokeRadius: (strokeRadius: number) => void
  onSetBrushStrength: (brushStrength: number) => void
  onSetEraserRadius: (eraserRadius: number) => void
}

export function BrushControls(props: BrushControlsProps) {
  return (
    <>
      <label class="range-control">
        Size
        <input
          class="w-28 accent-stone-950"
          type="range"
          min="0.015"
          max="0.12"
          step="0.005"
          value={props.strokeRadius}
          onInput={(event) => props.onSetStrokeRadius(event.currentTarget.valueAsNumber)}
        />
      </label>

      <label class="range-control">
        Strength
        <input
          class="w-24 accent-stone-950"
          name="brush-strength"
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={props.brushStrength}
          onInput={(event) =>
            props.onSetBrushStrength(event.currentTarget.valueAsNumber)
          }
        />
      </label>

      <label class="range-control">
        Eraser
        <input
          class="w-24 accent-stone-950"
          type="range"
          min="0.06"
          max="0.5"
          step="0.01"
          value={props.eraserRadius}
          onInput={(event) => props.onSetEraserRadius(event.currentTarget.valueAsNumber)}
        />
      </label>
    </>
  )
}
