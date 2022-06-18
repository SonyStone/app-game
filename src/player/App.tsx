import { createSignal, ErrorBoundary } from 'solid-js';

import s from './App.module.scss';
import { Controls } from './Controls';
import { Frame } from './interfaces/Frame';
import Player from './Player';
import Video from './video/Video';
import { useVideoContext, VideoContextProvider } from './VideoContext.provider';

export default function App() {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error(error);
        return <div>Error in the Player</div>;
      }}>
      <VideoContextProvider>
        <VideoApp></VideoApp>
      </VideoContextProvider>
    </ErrorBoundary>
  );
}

export function VideoApp() {
  const [
    { currentFrame, volume, playbackRate, src, fps, play, frameSize },
    { setCurrentFrame, setTotalFrames, setVolume, setPlaybackRate, setPlay },
  ] = useVideoContext();

  const [resize, setResize] = createSignal({ height: 0, width: 0 });

  console.log(`created App`);

  return (
    <div>
      <div class={s.App}>
        <Player
          onWheel={(event) => {
            if (event.deltaY > 0) {
              setCurrentFrame((currentFrame() + 1) as Frame);
            } else {
              setCurrentFrame((currentFrame() - 1) as Frame);
            }
          }}>
          {/* <Canvas size={resize()}></Canvas> */}
          <Video
            src={src()}
            play={play()}
            onPlay={setPlay}
            volume={volume()}
            onVolumeChange={setVolume}
            playbackRate={playbackRate()}
            onPlaybackRateChange={setPlaybackRate}
            onDimentions={setResize}
            currentFrame={currentFrame()}
            onCurrentFrame={setCurrentFrame}
            frameSize={frameSize()}
            onWaiting={() =>
              console.log(
                `Playback has stopped because of a temporary lack of data`
              )
            }
            // onVolumeChange={(e) => setVolume((e.target as any).value)}
            // onPause={() => setPlay(false)}
            // onPlay={() => setPlay(true)}

            onTotalFrames={setTotalFrames}></Video>
        </Player>
        <Controls />
      </div>
    </div>
  );
}
