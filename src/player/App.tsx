import { createSignal, ErrorBoundary, onMount } from "solid-js";

import s from "./App.module.scss";
import { Controls } from "./Controls";
import { Frame } from "./interfaces/Frame";
import Player from "./Player";
import Dimentions from "./video/Dimentions";
import { FrameControl } from "./video/FrameControl";
import { IsPlayingProvider } from "./video/IsPlaying.provider";
import { PlaybackRateControl } from "./video/PlaybackRateControl";
import { PlayControl } from "./video/PlayControl";
import TotalFrames from "./video/TotalFrames";
import Video from "./video/Video";
import { VideoControls } from "./video/VideoControls";
import { VolumeControl } from "./video/VolumeControl";
import { useVideoContext, VideoContextProvider } from "./VideoContext.provider";

export default function App() {
  return (
    <ErrorBoundary
      fallback={(error) => {
        console.error(error);
        return <div>Error in the Player</div>;
      }}
    >
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

  const [get, set] = createSignal(1);
  const asd = <div>{get()}</div>;

  console.log(`created App`, asd);

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
          }}
        >
          {/* <Canvas size={resize()}></Canvas> */}
          <Video
            src={src()}
            onWaiting={() =>
              console.log(
                `Playback has stopped because of a temporary lack of data`
              )
            }
          >
            <TotalFrames
              frameSize={frameSize()}
              onTotalFrames={setTotalFrames}
            />
            <Dimentions onDimentions={setResize} />
            <IsPlayingProvider>
              <PlayControl play={play()} onPlay={setPlay} />
              <FrameControl
                currentFrame={currentFrame()}
                onCurrentFrame={setCurrentFrame}
                frameSize={frameSize()}
              />
            </IsPlayingProvider>
            <VideoControls />
            <VolumeControl volume={volume()} onVolumeChange={setVolume} />
            <PlaybackRateControl
              playbackRate={playbackRate()}
              onPlaybackRateChange={setPlaybackRate}
            />
          </Video>
        </Player>
        <Controls />
      </div>
    </div>
  );
}
