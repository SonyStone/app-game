import { SketchIcon } from '../../shared/SketchIcon';

type FrameControlsProps = {
  currentFrame: number;
  onSetCurrentFrame: (frameNumber: number) => void;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onInsertBlankFrame: () => void;
  onDuplicateHeldFrame: () => void;
  onDeleteActiveFrame: () => void;
};

export function FrameControls(props: FrameControlsProps) {
  return (
    <div class="frame-controls">
      <button
        class="icon-button"
        type="button"
        title="Previous frame"
        aria-label="Previous frame"
        disabled={props.currentFrame <= 1}
        onClick={props.onPreviousFrame}
      >
        <SketchIcon name="left" />
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
        aria-label="Current frame"
      />
      <button class="icon-button" type="button" title="Next frame" aria-label="Next frame" onClick={props.onNextFrame}>
        <SketchIcon name="right" />
      </button>
      <button class="command-button" type="button" onClick={props.onInsertBlankFrame}>
        New frame
      </button>
      <button class="command-button" type="button" onClick={props.onDuplicateHeldFrame}>
        Duplicate
      </button>
      <button class="command-button" type="button" onClick={props.onDeleteActiveFrame}>
        Delete frame
      </button>
    </div>
  );
}
