import { createSignal, ErrorBoundary, For } from 'solid-js';

import s from './App.module.scss';
import Canvas from './Canvas';
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
import Player from './Player';
import Timeline from './Timeline';
import { onHold } from './utils/onHold';
import Video from './Video';
import { useVideoContext, VideoContextProvider } from './VideoContext.provider';

export default function App() {
  return (
    <VideoContextProvider>
      {() => {
        const [
          {
            currentTime,
            currentFrame,
            totalFrames,
            brushSize,
            brushColor,
            brushComposite,
            volume,
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
            setSrc,
            setFps,
            setPlay,
          },
        ] = useVideoContext();

        onHold;

        const [resize, setResize] = createSignal({ height: 0, width: 0 });

        return (
          <div>
            <ErrorBoundary fallback={<div>Error in App</div>}>
              <div class={s.App}>
                <Player
                  onWheel={(event) => {
                    if (event.deltaY > 0) {
                      setCurrentFrame((currentFrame() + 1) as Frame);
                    } else {
                      setCurrentFrame((currentFrame() - 1) as Frame);
                    }
                  }}>
                  <Canvas size={resize()}></Canvas>
                  <Video
                    src={src()}
                    play={play()}
                    volume={volume()}
                    onDimentions={setResize}
                    onWaiting={() =>
                      console.log(
                        `Playback has stopped because of a temporary lack of data`
                      )
                    }
                    // onVolumeChange={(e) => setVolume((e.target as any).value)}
                    // onPause={() => setPlay(false)}
                    // onPlay={() => setPlay(true)}
                    onTotalFrames={setTotalFrames}
                    frameSize={frameSize()}></Video>
                </Player>
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
                      onChange={(e) => setBrushColor((e.target as any).value)}
                    />

                    <input
                      type="range"
                      min={0.1}
                      max={50}
                      value={brushSize()}
                      onChange={(e) =>
                        setBrushSize(parseFloat((e.target as any).value))
                      }
                    />

                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume()}
                      onChange={(e) => setVolume((e.target as any).value)}
                    />
                  </div>

                  <div class={s.action}>
                    <button onClick={() => setCurrentFrame(0 as Frame)}>
                      <SkipPreviousIcon></SkipPreviousIcon>
                    </button>
                    <button
                      use:onHold={() =>
                        setCurrentFrame((currentFrame() - 1) as Frame)
                      }
                      onClick={() =>
                        setCurrentFrame((currentFrame() - 1) as Frame)
                      }>
                      <FastRewindIcon></FastRewindIcon>
                    </button>
                    <button onClick={() => setPlay(!play())}>
                      <PlayIcon></PlayIcon>
                    </button>
                    <button onClick={() => setPlay(false)}>
                      <PauseIcon></PauseIcon>
                    </button>
                    <button
                      use:onHold={() =>
                        setCurrentFrame((currentFrame() + 1) as Frame)
                      }
                      onClick={() =>
                        setCurrentFrame((currentFrame() + 1) as Frame)
                      }>
                      <FastForwardIcon></FastForwardIcon>
                    </button>
                    <button
                      onClick={() => setCurrentFrame(totalFrames() as Frame)}>
                      <SkipNextIcon></SkipNextIcon>
                    </button>
                  </div>

                  <span>
                    Is playing: <b>{`${play()}`}</b>
                  </span>

                  <div class={s.frame_rate}>
                    <span>
                      Frame rate: <b>{fps()}</b>
                    </span>
                    <select
                      value={fps()}
                      onChange={(e) => setFps((e.target as any).value)}>
                      <For each={FRAME_RATES}>
                        {(item) => (
                          <option value={item.value}>{item.name}</option>
                        )}
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

                  <span>
                    Time: <span class={s.code}>{currentTime()}</span>
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
              </div>
            </ErrorBoundary>
          </div>
        );
      }}
    </VideoContextProvider>
  );
}
