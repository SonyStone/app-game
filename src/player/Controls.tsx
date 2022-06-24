import { createSignal, For } from 'solid-js';

import s from './App.module.scss';
import { EXAMPLE_VIDEOS } from './example-videos';
import EraserIcon from './icons/eraser.svg';
import FastForwardIcon from './icons/fast-forward.svg';
import FastRewindIcon from './icons/fast-rewind.svg';
import PauseIcon from './icons/pause.svg';
import PenIcon from './icons/pen.svg';
import PlayIcon from './icons/play.svg';
import RedoIcon from './icons/redo.svg';
import SaveIcon from './icons/save.svg';
import SkipNextIcon from './icons/skip-next.svg';
import SkipPreviousIcon from './icons/skip-previous.svg';
import UndoIcon from './icons/undo.svg';
import { COMPOSITE_OPERATIONS } from './interfaces/CompositeOperations';
import { Frame } from './interfaces/Frame';
import { FRAME_RATES } from './interfaces/FrameRate';
import Rewind from './Rewind';
import Timeline from './Timeline';
import { onHold } from './utils/onHold';
import { useVideoContext } from './VideoContext.provider';

export function Controls() {
  const [
    {
      currentTimecode,
      currentFrame,
      totalFrames,
      brushSize,
      brushColor,
      brushComposite,
      volume,
      playbackRate,
      src,
      fps,
      play,
      frameSize,
    },
    {
      setCurrentFrame,
      setTotalFrames,
      setBrushSize,
      setBrushColor,
      setBrushComposite,
      setVolume,
      setPlaybackRate,
      setSrc,
      setFps,
      setPlay,
    },
  ] = useVideoContext();

  console.log(`created Controls`);

  const [rewind, setRewind] = createSignal<number>(0);

  onHold;

  return (
    <div class={s.player}>
      <div class={s.action_start}>
        {/* <FilesInput></FilesInput> */}

        <button
          onClick={() => setBrushComposite(COMPOSITE_OPERATIONS[0])}
          disabled={brushComposite() === COMPOSITE_OPERATIONS[0]}>
          <PenIcon></PenIcon>
        </button>

        <button
          onClick={() => setBrushComposite(COMPOSITE_OPERATIONS[1])}
          disabled={brushComposite() === COMPOSITE_OPERATIONS[1]}>
          <EraserIcon></EraserIcon>
        </button>

        <input
          type="color"
          value={brushColor()}
          onInput={(e) => setBrushColor((e.target as any).value)}
        />

        <input
          type="range"
          min={0.1}
          max={50}
          value={brushSize()}
          onInput={(e) => setBrushSize(parseFloat((e.target as any).value))}
        />
      </div>
      <div class={s.action}>
        <button onClick={() => setCurrentFrame(0 as Frame)}>
          <SkipPreviousIcon></SkipPreviousIcon>
        </button>
        <button
          use:onHold={() => setCurrentFrame((currentFrame() - 1) as Frame)}
          onClick={() => setCurrentFrame((currentFrame() - 1) as Frame)}>
          <FastRewindIcon></FastRewindIcon>
        </button>
        <button onClick={() => setPlay(!play())}>
          <PlayIcon></PlayIcon>
        </button>
        <button onClick={() => setPlay(false)}>
          <PauseIcon></PauseIcon>
        </button>
        <button
          use:onHold={() => setCurrentFrame((currentFrame() + 1) as Frame)}
          onClick={() => setCurrentFrame((currentFrame() + 1) as Frame)}>
          <FastForwardIcon></FastForwardIcon>
        </button>
        <button onClick={() => setCurrentFrame(totalFrames() as Frame)}>
          <SkipNextIcon></SkipNextIcon>
        </button>
      </div>

      <div>
        <label for="volume">Volume:</label>
        <input
          name="volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume()}
          onInput={(e) => setVolume(parseFloat((e.target as any).value))}
        />
      </div>

      <div>
        <label for="playbackRate">Playback Rate:</label>
        <input
          name="playbackRate"
          type="range"
          min={0}
          max={8}
          step={0.01}
          value={playbackRate()}
          onInput={(e) => setPlaybackRate(parseFloat((e.target as any).value))}
        />
        <button onClick={() => setPlaybackRate(0.5)}>0.5</button>
        <button onClick={() => setPlaybackRate(1)}>1.0</button>
        <button onClick={() => setPlaybackRate(1.5)}>1.5</button>
      </div>

      <div>
        <Rewind
          rewind={rewind()}
          currentFrame={currentFrame()}
          onCurrentFrame={setCurrentFrame}
        />
        <label for="rewind">rewind</label>
        <input
          name="rewind"
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={rewind()}
          onInput={(e) => {
            setRewind(parseFloat((e.target as any).value));
          }}
          onPointerUp={(e) => {
            setTimeout(() => {
              setRewind(0);
            }, 0);
          }}
        />
      </div>

      <span>
        Is playing: <b>{`${play()}`}</b>
      </span>
      <div class={s.frame_rate}>
        <span>
          Frame rate: <b>{fps()}</b>
        </span>
        <select value={fps()} onChange={(e) => setFps((e.target as any).value)}>
          <For each={FRAME_RATES}>
            {(item) => <option value={item.value}>{item.name}</option>}
          </For>
        </select>
        <input
          type="number"
          min={0}
          max={9000}
          value={fps()}
          onInput={(e) => setFps((e.target as any).value)}
        />
      </div>
      <div class={s.frame_rate}>
        <span>Videos: </span>
        <select
          value={src()}
          onChange={(e) => {
            setSrc((e.target as any).value);
          }}>
          <For each={EXAMPLE_VIDEOS}>
            {(item) => <option value={item.value}>{item.name}</option>}
          </For>
        </select>
      </div>

      <span>
        Time: <span class={s.code}>{currentTimecode()}</span>
      </span>
      <span>
        Frame:{' '}
        <span class={s.code}>
          {currentFrame()}/{totalFrames()}
        </span>
      </span>
      <div>
        <Timeline></Timeline>
      </div>
      <div class={s.action_start}>
        <button>
          <SaveIcon></SaveIcon>
        </button>

        <button>
          <UndoIcon></UndoIcon>
        </button>
        <button>
          <RedoIcon></RedoIcon>
        </button>
      </div>
    </div>
  );
}
