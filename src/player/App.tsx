import { createMemo, createSignal, ErrorBoundary, Show } from 'solid-js';

import s from './App.module.scss';
import { Frame } from './interfaces/Frame';
import { createVideoHandler } from './media-handler';
import { onHold } from './utils/onHold';

import { For } from 'solid-js';

import { createShortcut } from '@solid-primitives/keyboard';
import Canvas from './Canvas';
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
import { FRAME_RATES } from './interfaces/FrameRate';
import Rewind from './Rewind';
import Timeline from './Timeline';
import { createFileDrop } from './utils/file-drop';

declare module 'solid-js' {
  namespace JSX {
    interface ExplicitAttributes {
      type: string;
    }
  }
}

export default function App() {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error(error);
        return <div>Error in the Player</div>;
      }}
    >
      <VideoApp></VideoApp>
    </ErrorBoundary>
  );
}

export function VideoApp() {
  const [
    {
      currentFrame,
      totalFrames,
      progressFramse,
      src,
      dimentions,
      isPlaying,
      volume,
      playbackRate,
      currentTimecode,
      fps,
      resize
    },
    {
      setSrc,
      setFps,
      nextFrame,
      previousFrame,
      setPlaybackRate,
      setVolume,
      setMedia,
      setCurrentFrame,
      play,
      pause,
      playPause
    }
  ] = createVideoHandler();

  const onWaiting = () => console.log(`Playback has stopped because of a temporary lack of data`);

  const [rewind, setRewind] = createSignal<number>(0);

  const [brushSize, setBrushSize] = createSignal(20);
  const [brushColor, setBrushColor] = createSignal('#ffffff');
  const [brushComposite, setBrushComposite] = createSignal(COMPOSITE_OPERATIONS[0]);

  createShortcut(['Control', 'Z'], () => {
    console.log(`undo!`);
  });
  createShortcut(['Control', 'Y'], () => {
    console.log(`redo!`);
  });
  createShortcut(['P'], playPause);
  createShortcut([' '], playPause);
  createShortcut(['ArrowRight'], nextFrame);
  createShortcut(['ArrowLeft'], previousFrame);

  const { over, files, setElement } = createFileDrop();

  const videoFile = createMemo<File | undefined>((file) => files().find(isVideoFile) || file);
  const commentFile = createMemo<File | undefined>((file) => files().find(isJsonFile) || file);

  const fileSrc = createMemo(() => {
    const file = videoFile();
    return file ? URL.createObjectURL(file) : undefined;
  });

  onHold;

  return (
    <div>
      <div class={s.App}>
        <div
          class={s.column_container}
          onWheel={(event) => {
            if (event.deltaY > 0) {
              nextFrame();
            } else {
              previousFrame();
            }
          }}
        >
          <div class={s.wrapper} ref={setElement}>
            {/* <canvas               ref={setCanvas} /> */}
            <Canvas
              size={resize()}
              dimentions={dimentions()}
              brushSize={brushSize()}
              brushColor={brushColor()}
              brushComposite={brushComposite()}
            />
            <video ref={setMedia} src={fileSrc() ?? src()} class={s.video} controls={false} attr:type="video/mp4" />
          </div>
        </div>
        <div class={s.player}>
          <div class={s.action_start}>
            {/* <FilesInput></FilesInput> */}

            <button
              onClick={() => setBrushComposite(COMPOSITE_OPERATIONS[0])}
              disabled={brushComposite() === COMPOSITE_OPERATIONS[0]}
            >
              <PenIcon></PenIcon>
            </button>

            <button
              onClick={() => setBrushComposite(COMPOSITE_OPERATIONS[1])}
              disabled={brushComposite() === COMPOSITE_OPERATIONS[1]}
            >
              <EraserIcon></EraserIcon>
            </button>

            <input type="color" value={brushColor()} onInput={(e) => setBrushColor((e.target as any).value)} />

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
              onClick={() => setCurrentFrame((currentFrame() - 1) as Frame)}
            >
              <FastRewindIcon></FastRewindIcon>
            </button>
            <Show
              when={isPlaying()}
              fallback={
                <button onClick={() => play()}>
                  <PlayIcon></PlayIcon>
                </button>
              }
            >
              <button onClick={() => pause()}>
                <PauseIcon></PauseIcon>
              </button>
            </Show>

            <button
              use:onHold={() => setCurrentFrame((currentFrame() + 1) as Frame)}
              onClick={() => setCurrentFrame((currentFrame() + 1) as Frame)}
            >
              <FastForwardIcon></FastForwardIcon>
            </button>
            <button onClick={() => setCurrentFrame(totalFrames() as Frame)}>
              <SkipNextIcon></SkipNextIcon>
            </button>
          </div>

          <div>
            <Timeline
              currentFrame={currentFrame()}
              totalFrames={totalFrames()}
              setCurrentFrame={setCurrentFrame}
              pause={pause}
              progress={progressFramse()}
            />
          </div>

          <span>
            <span class={s.code}>
              {currentTimecode().suffix < 0 ? '-' : ' '}
              {formatTimeItem(currentTimecode().hours)}:{formatTimeItem(currentTimecode().minutes)}:
              {formatTimeItem(currentTimecode().seconds)}:{formatTimeItem(currentTimecode().frames)}
            </span>{' '}
            <span class={s.code}>
              {currentFrame()}/{totalFrames()}
            </span>
          </span>

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
            <Rewind rewind={rewind()} currentFrame={currentFrame()} onCurrentFrame={setCurrentFrame} />
            <label for="rewind">Rewind:</label>
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
            Is playing: <b>{`${isPlaying()}`}</b>
          </span>
          <div class={s.frame_rate}>
            <span>
              Frame rate: <b>{fps()}</b>
            </span>
            <select value={fps()} onChange={(e) => setFps((e.target as any).value)}>
              <For each={FRAME_RATES}>{(item) => <option value={item.value}>{item.name}</option>}</For>
            </select>
            <input type="number" min={0} max={9000} value={fps()} onInput={(e) => setFps((e.target as any).value)} />
          </div>
          <div class={s.frame_rate}>
            <span>Videos: </span>
            <select
              value={src()}
              onChange={(e) => {
                setSrc((e.target as any).value);
              }}
            >
              <For each={EXAMPLE_VIDEOS}>{(item) => <option value={item.value}>{item.name}</option>}</For>
            </select>
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
    </div>
  );
}

function formatTimeItem(item: number): string {
  return item < 10 ? `0${item}` : `${item}`;
}

function isVideoFile(file: File) {
  return file.type === 'video/mp4' || file.type === 'video/webm';
}

function isJsonFile(file: File) {
  return file.type === 'application/json';
}
