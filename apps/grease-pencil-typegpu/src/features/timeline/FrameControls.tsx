type FrameControlsProps = {
  currentFrame: number
  onSetCurrentFrame: (frameNumber: number) => void
  onPreviousFrame: () => void
  onNextFrame: () => void
  onInsertBlankFrame: () => void
  onDuplicateHeldFrame: () => void
  onDeleteActiveFrame: () => void
}

export function FrameControls(props: FrameControlsProps) {
  return (
    <div class="frame-controls">
      <button
        class="icon-button"
        type="button"
        title="Previous frame"
        onClick={props.onPreviousFrame}
      >
        -
      </button>
      <input
        class="frame-input"
        id="current-frame"
        name="current-frame"
        type="number"
        min="1"
        value={String(props.currentFrame)}
        onInput={(event) => props.onSetCurrentFrame(event.currentTarget.valueAsNumber)}
        title="Current frame"
      />
      <button
        class="icon-button"
        type="button"
        title="Next frame"
        onClick={props.onNextFrame}
      >
        +
      </button>
      <button class="command-button" type="button" onClick={props.onInsertBlankFrame}>
        Blank
      </button>
      <button class="command-button" type="button" onClick={props.onDuplicateHeldFrame}>
        Dup
      </button>
      <button class="command-button" type="button" onClick={props.onDeleteActiveFrame}>
        Del
      </button>
    </div>
  )
}
