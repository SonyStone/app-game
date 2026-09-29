# @solid-primitives/audio

Source version: `3.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/audio/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitives to manage audio playback in the browser. The primitives are layered: `make*` variants are non-reactive base primitives that require no Solid owner, while `createAudio` integrates with Solid's reactive system.

Within an SSR context these primitives perform noops and never interrupt the process.

## Installation

```
npm install @solid-primitives/audio
# or
yarn add @solid-primitives/audio
# or
pnpm add @solid-primitives/audio
```

## How to use it

### makeAudio

A foundational non-reactive primitive that creates a raw `HTMLAudioElement` with optional event handlers. No Solid owner required.

```ts
const [player, cleanup] = makeAudio("example.mp3");
// later:
cleanup();
```

#### Definition

```ts
function makeAudio(
  src: AudioSource | HTMLAudioElement,
  handlers?: AudioEventHandlers,
): [player: HTMLAudioElement, cleanup: VoidFunction];
```

### makeAudioPlayer

Wraps `makeAudio` with simple playback controls. No Solid owner required.

```ts
const [{ play, pause, seek, setVolume, player }, cleanup] = makeAudioPlayer("example.mp3");
play();
seek(30);
cleanup();
```

#### Definition

```ts
function makeAudioPlayer(
  src: AudioSource | HTMLAudioElement,
  handlers?: AudioEventHandlers,
): [controls: AudioControls, cleanup: VoidFunction];
```

`AudioControls`:

```ts
type AudioControls = {
  play: () => Promise<void>;
  pause: VoidFunction;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  player: HTMLAudioElement;
};
```

The `seek` function uses `fastSeek` on [supporting browsers](https://caniuse.com/?search=fastseek).

### createAudio

A reactive audio primitive. Returns a flat object with writable signal accessors for `playing` and `volume`, a reactive `currentTime`, and an async `duration` that suspends until audio metadata is loaded — integrating with `<Suspense>` / `<Loading>`.

```ts
const audio = createAudio("example.mp3");

audio.playing(); // boolean
audio.setPlaying(true); // plays
audio.volume(); // 0–1
audio.setVolume(0.5);
audio.currentTime(); // seconds
audio.seek(30);
```

The `duration` accessor throws `NotReadyError` until the audio metadata has loaded, making it work naturally with Solid 2.0's `<Loading>` boundary. After the first `loadeddata` event it returns the duration in seconds reactively. The pending state resets whenever the source changes.

```tsx
<Loading fallback="Loading...">
  <span>{audio.duration()}s</span>
</Loading>
```

The `src` argument can be a reactive accessor — switching sources replaces the track and seeks to the start:

```ts
const [src, setSrc] = createSignal("track1.mp3");
const audio = createAudio(src);
setSrc("track2.mp3");
```

#### Seek slider (scrubbing)

`currentTime` updates continuously during playback, so binding a `<input type="range">` directly to it fights the user while they drag the thumb. Track a local "scrubbing" signal to show the dragged position instead, and only call `seek` once the user releases:

```tsx
const audio = createAudio("example.mp3");
const [scrubTime, setScrubTime] = createSignal<number | undefined>();

<input
  type="range"
  min={0}
  max={audio.duration()}
  value={scrubTime() ?? audio.currentTime()}
  onInput={e => setScrubTime(e.currentTarget.valueAsNumber)}
  onChange={e => {
    audio.seek(e.currentTarget.valueAsNumber);
    setScrubTime(undefined);
  }}
/>;
```

`onInput` fires continuously while dragging (updates the displayed value only); `onChange` fires once on release, when the seek should actually happen.

#### Definition

```ts
function createAudio(src: AudioSource | Accessor<AudioSource>): AudioReturn;
```

`AudioReturn`:

```ts
type AudioReturn = {
  player: HTMLAudioElement;
  playing: Accessor<boolean>;
  setPlaying: (v: boolean) => void;
  volume: Accessor<number>;
  setVolume: (v: number) => void;
  currentTime: Accessor<number>;
  duration: Accessor<number>; // async — suspends until loaded
  seek: (time: number) => void;
};
```

## Audio Source

All primitives accept `AudioSource` as their `src` argument:

```ts
type AudioSource = string | undefined | MediaProvider;
```

This includes `MediaSource` and `MediaStream`, enabling streamed or Blob-backed audio:

```ts
const media = new MediaSource();
const audio = createAudio(URL.createObjectURL(media));
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/audio/CHANGELOG.md)
