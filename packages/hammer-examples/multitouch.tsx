import { Title } from '@solidjs/meta';
import { Show, createSignal, onSettled } from 'solid-js';
import { createDemoRecording, demoCaption } from './demo-recording';
import './multitouch.css';
import {
  MAX_RECORDING_MS,
  createPlayback,
  createRecording,
  readPointerSample,
  type PointerRecording,
  type PointerSample
} from './pointer-recording';
import { createPointerScene } from './pointer-scene';

/** A full-screen pointer studio. One in-memory take lasts at most sixty seconds. */
export default function Multitouch() {
  let surface!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let stylusCanvas!: HTMLCanvasElement;
  let scene: ReturnType<typeof createPointerScene> | undefined;
  let take: PointerRecording | undefined;
  let playback: ReturnType<typeof createPlayback> | undefined;
  let liveOrigin = performance.now();
  let playbackOrigin = 0;
  let frame = 0;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  const [mode, setMode] = createSignal<'live' | 'recording' | 'playing' | 'paused'>('live');
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [count, setCount] = createSignal(0);
  const [hasInk, setHasInk] = createSignal(false);
  const [details, setDetails] = createSignal(true);
  const [has3D, setHas3D] = createSignal(true);
  const [isDemo, setIsDemo] = createSignal(true);
  const [hasLiveMouse, setHasLiveMouse] = createSignal(false);
  const [telemetry, setTelemetry] = createSignal<PointerSample>();
  const [contacts, setContacts] = createSignal(0);
  const isReplay = () => mode() === 'playing' || mode() === 'paused';
  const status = () => ({ live: 'Вживую', recording: 'Запись', playing: 'Воспроизведение', paused: 'Пауза' })[mode()];

  function toggleRecording() {
    if (!scene) return;
    if (mode() === 'recording') {
      stopRecording();
      return;
    }
    clearTimeout(limitTimer);
    const bounds = surface.getBoundingClientRect();
    liveOrigin = performance.now();
    take = createRecording(bounds.width, bounds.height, liveOrigin);
    setIsDemo(false);
    setHasLiveMouse(false);
    playback = undefined;
    scene.reset(bounds.width, bounds.height);
    setPosition(0);
    setDuration(0);
    setCount(0);
    setHasInk(false);
    setMode('recording');
    limitTimer = setTimeout(stopRecording, MAX_RECORDING_MS);
  }

  function stopRecording() {
    if (mode() !== 'recording' || !take || !scene) return;
    clearTimeout(limitTimer);
    take.finish(performance.now());
    setDuration(take.duration);
    setCount(take.samples.length);
    playback = createPlayback(take, scene);
    setPosition(playback.seek(take.duration));
    setMode('paused');
  }

  function togglePlayback() {
    if (mode() === 'recording' || !take?.samples.length || !scene) return;
    if (mode() === 'playing') {
      setPosition(playback?.seek(performance.now() - playbackOrigin) ?? position());
      setMode('paused');
      return;
    }
    const nextPosition = !isReplay() || position() >= take.duration ? 0 : position();
    if (!isReplay()) {
      scene.reset(take.width, take.height);
      playback = createPlayback(take, scene);
    }
    if (position() >= take.duration) {
      playback = createPlayback(take, scene);
    }
    playback?.seek(nextPosition);
    setPosition(nextPosition);
    playbackOrigin = performance.now() - nextPosition;
    setHasInk(true);
    setMode('playing');
  }

  function seek(time: number) {
    if (!scene || !take?.samples.length || mode() === 'recording') return;
    if (!isReplay()) {
      scene.reset(take.width, take.height);
      playback = createPlayback(take, scene);
    }
    setPosition(playback?.seek(time) ?? 0);
    setHasInk(true);
    setMode('paused');
  }

  function returnToLive() {
    if (mode() === 'recording') return;
    const bounds = surface.getBoundingClientRect();
    scene?.reset(bounds.width, bounds.height);
    setHasLiveMouse(false);
    liveOrigin = performance.now();
    setHasInk(false);
    setPosition(0);
    setMode('live');
  }

  /** Only the drawing surface owns input; toolbar interactions never enter the take. */
  function handlePointer(event: PointerEvent) {
    if (!scene || isReplay()) return;
    if (mode() === 'recording' && performance.now() - liveOrigin >= MAX_RECORDING_MS) {
      stopRecording();
      return;
    }
    if (event.type === 'lostpointercapture' && !scene.pointers.get(event.pointerId)?.down) return;
    if (event.type === 'pointerdown') {
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        /* Synthetic input has no native capture. */
      }
      setHasInk(true);
    }
    const bounds = surface.getBoundingClientRect();
    const coalesced = event.type === 'pointermove' ? (event.getCoalescedEvents?.() ?? []) : [];
    for (const point of [...coalesced, event]) {
      if (mode() === 'recording' && point.timeStamp < liveOrigin) continue;
      const sample = {
        ...readPointerSample(point, bounds, Math.max(0, point.timeStamp - liveOrigin)),
        type: point === event ? event.type : 'pointermove'
      };
      Object.assign(sample, scene.toStage(sample.x, sample.y));
      // Coalesced samples precede their parent; retain both reported measurements.
      scene.apply(sample);
      if (mode() === 'recording') take?.append(sample);
    }
  }

  onSettled(() => {
    scene = createPointerScene(canvas, stylusCanvas);
    setHas3D(scene.has3D);
    const resize = () => {
      const bounds = surface.getBoundingClientRect();
      scene?.resize(bounds.width, bounds.height);
    };
    resize();
    take = createDemoRecording();
    scene.reset(take.width, take.height);
    playback = createPlayback(take, scene);
    playback.seek(0);
    playbackOrigin = performance.now();
    setDuration(take.duration);
    setCount(take.samples.length);
    setHasInk(true);
    setMode('playing');
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    const events = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'pointerenter',
      'pointerleave',
      'lostpointercapture'
    ] as const;
    for (const type of events) surface.addEventListener(type, handlePointer);
    const contextMenu = (event: Event) => event.preventDefault();
    surface.addEventListener('contextmenu', contextMenu);
    const blur = () => {
      if (mode() === 'recording') stopRecording();
      else if (mode() === 'playing') togglePlayback();
      else if (mode() === 'live') scene?.pointers.clear();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return;
      if (event.code === 'KeyR') {
        event.preventDefault();
        toggleRecording();
      }
      if (event.code === 'Space') {
        // Preserve native keyboard activation for a focused toolbar button.
        if (event.target instanceof HTMLElement && event.target.closest('button')) return;
        event.preventDefault();
        togglePlayback();
      }
      if (event.code === 'Escape') {
        mode() === 'recording' ? stopRecording() : returnToLive();
      }
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    let lastTelemetry = 0;
    const render = (now: number) => {
      let sceneTime = isReplay() ? position() : now - liveOrigin;
      if (mode() === 'recording') {
        setPosition(Math.min(MAX_RECORDING_MS, now - liveOrigin));
        if (now - liveOrigin >= MAX_RECORDING_MS) stopRecording();
      } else if (mode() === 'playing' && playback) {
        const nextPosition = playback.seek(now - playbackOrigin);
        sceneTime = nextPosition;
        setPosition(nextPosition);
        if (nextPosition >= duration()) setMode('paused');
      }
      scene?.render(sceneTime, details());
      setHasLiveMouse(
        !isReplay() &&
          Array.from(scene?.pointers.values() ?? []).some(
            (pointer) => pointer.sample.pointerType === 'mouse' && pointer.inside
          )
      );
      if (now - lastTelemetry > 80) {
        setTelemetry(scene?.latest);
        setContacts(Array.from(scene?.pointers.values() ?? []).filter((pointer) => pointer.down).length);
        if (mode() === 'recording') setCount(take?.samples.length ?? 0);
        lastTelemetry = now;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(limitTimer);
      observer.disconnect();
      for (const type of events) surface.removeEventListener(type, handlePointer);
      surface.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      scene?.dispose();
    };
  });

  return (
    <main class="pointer-studio" data-mode={mode()} data-live-mouse={hasLiveMouse() ? 'true' : 'false'}>
      <Title>Pointer Studio · Multitouch</Title>
      <div
        ref={surface}
        class="pointer-studio__surface"
        aria-label="Рабочая поверхность для мыши, стилуса и мультитача"
      >
        <canvas ref={canvas} aria-hidden="true" />
        <canvas ref={stylusCanvas} aria-hidden="true" />
      </div>
      <header class="pointer-studio__header">
        <div class="pointer-studio__brand">
          <span class="pointer-studio__mark">
            <Icon name="pen" />
          </span>
          <div>
            <h1>Pointer Studio</h1>
            <p>Мышь · Стилус · Мультитач</p>
          </div>
        </div>
        <div class="pointer-studio__header-actions">
          <span class="pointer-studio__status" role="status">
            <i />
            {status()}
          </span>
          <button
            class={`pointer-studio__icon-button ${details() ? 'is-active' : ''}`}
            onClick={() => setDetails(!details())}
            aria-label="Показывать данные PointerEvents"
            aria-pressed={details() ? 'true' : 'false'}
            title="Данные PointerEvents"
          >
            <Icon name="info" />
          </button>
        </div>
      </header>
      <Show when={!hasInk() && !isReplay()}>
        <div class="pointer-studio__welcome">
          <div class="pointer-studio__welcome-art">
            <span />
            <span />
            <span />
            <Icon name="pen" />
          </div>
          <h2>Каждое касание видно.</h2>
          <p>
            Рисуйте мышью, пером или несколькими пальцами.
            <br />
            Запишите движение и рассмотрите его снова.
          </p>
          <span class="pointer-studio__hint">Одна запись · до 60 секунд</span>
        </div>
      </Show>
      <Show when={isReplay()}>
        <div class="pointer-studio__replay-note">
          <Icon name="play" /> {isDemo() ? demoCaption(position()) : 'Записанные действия'}{' '}
          <span>{isDemo() ? 'Демо' : '1×'}</span>
        </div>
      </Show>
      <footer class="pointer-studio__footer">
        <Show when={details()}>
          <div class="pointer-studio__telemetry">
            <span class="pointer-studio__event">{telemetry()?.type ?? 'PointerEvents'}</span>
            <span>
              {telemetry()?.pointerType ?? 'нет ввода'}
              {telemetry() ? ` #${telemetry()?.pointerId}` : ''}
            </span>
            <span>
              контакты <b>{contacts()}</b>
            </span>
            <span>
              нажим <b>{(telemetry()?.pressure ?? 0).toFixed(2)}</b>
            </span>
            <span class="pointer-studio__extra">
              наклон{' '}
              <b>
                {telemetry()?.tiltX ?? 0}° / {telemetry()?.tiltY ?? 0}°
              </b>
            </span>
            <span class="pointer-studio__extra">
              кнопки <b>{telemetry()?.buttons ?? 0}</b>
            </span>
            <Show when={telemetry()?.pointerType === 'pen'}>
              <span class="pointer-studio__extra">
                поворот <b>{telemetry()?.twist ?? 0}°</b>
              </span>
            </Show>
            <Show when={!has3D()}>
              <span>стилус 2D</span>
            </Show>
          </div>
        </Show>
        <div class="pointer-studio__dock" role="toolbar" aria-label="Запись и воспроизведение">
          <button
            class={`pointer-studio__record ${mode() === 'recording' ? 'is-recording' : ''}`}
            onClick={toggleRecording}
            title="Запись / стоп · R"
            aria-label={mode() === 'recording' ? 'Остановить запись' : 'Начать новую запись'}
          >
            <span class="pointer-studio__record-dot" />
            <span>{mode() === 'recording' ? 'Стоп' : 'Запись'}</span>
          </button>
          <span class="pointer-studio__divider" />
          <button
            class="pointer-studio__icon-button"
            onClick={togglePlayback}
            disabled={!count() || mode() === 'recording'}
            aria-label={mode() === 'playing' ? 'Пауза' : 'Воспроизвести запись'}
            title="Воспроизведение / пауза · Пробел"
          >
            <Icon name={mode() === 'playing' ? 'pause' : 'play'} />
          </button>
          <div class="pointer-studio__timeline">
            <div class="pointer-studio__time">
              <span>{formatTime(position())}</span>
              <span>{formatTime(mode() === 'recording' ? MAX_RECORDING_MS : duration())}</span>
            </div>
            <input
              type="range"
              min="0"
              max={mode() === 'recording' ? MAX_RECORDING_MS : duration() || 1}
              step="1"
              value={position()}
              disabled={!count() || mode() === 'recording'}
              onInput={(event) => seek(event.currentTarget.valueAsNumber)}
              aria-label="Позиция воспроизведения"
              aria-valuetext={`${formatTime(position())} из ${formatTime(duration())}`}
            />
          </div>
          <span class="pointer-studio__divider" />
          <button
            class="pointer-studio__icon-button"
            onClick={returnToLive}
            disabled={mode() === 'recording'}
            aria-label={isReplay() ? 'Вернуться к живому вводу' : 'Очистить поверхность'}
            title={isReplay() ? 'Вернуться к живому вводу · Esc' : 'Очистить поверхность'}
          >
            <Icon name={isReplay() ? 'pen' : 'clear'} />
          </button>
        </div>
        <p class="pointer-studio__footnote">
          {mode() === 'recording'
            ? 'Записываем движения и касания'
            : isReplay()
              ? isDemo()
                ? 'Демонстрация · Запись — создать свою · Esc — рисовать'
                : `Событий: ${count().toLocaleString('ru-RU')} · новая запись заменит предыдущую`
              : count()
                ? isDemo()
                  ? 'Нажмите ▶, чтобы снова посмотреть демонстрацию'
                  : 'Последняя запись доступна для воспроизведения'
                : 'R — запись · Пробел — воспроизведение'}
        </p>
      </footer>
    </main>
  );
}

function formatTime(milliseconds: number) {
  const tenths = Math.floor(milliseconds / 100);
  return `${Math.floor(tenths / 600)
    .toString()
    .padStart(2, '0')}:${Math.floor((tenths / 10) % 60)
    .toString()
    .padStart(2, '0')}.${tenths % 10}`;
}

/** Small inline icons share the toolbar's stroke weight and need no asset requests. */
function Icon(props: { name: 'pen' | 'play' | 'pause' | 'clear' | 'info' }) {
  const paths = {
    pen: 'm15 3 6 6M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2',
    play: 'm8 5 11 7-11 7Z',
    pause: 'M8 5v14M16 5v14',
    clear: 'm4 14 8-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-7 8H8l-4-4a2 2 0 0 1 0-2Zm4-5 9 8M13 20h8',
    info: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16'
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name]} />
    </svg>
  );
}
