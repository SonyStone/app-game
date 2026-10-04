import { createEventListener } from '@solid-primitives/event-listener';
import { createTimer } from '@solid-primitives/timer';
import type { Result } from 'neverthrow';
import { createEffect, createSignal, untrack } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintError } from '../../shared/errors';
import { paintBuild } from '../pwa/buildInfo';
import {
  abbreviate,
  readEnvironment,
  readKey,
  readPointer,
  readWheel,
  recordedPointerTypes,
  recordingVersion,
  type InputRecording,
  type RecordedEvent
} from './inputRecording';

/**
 * Records what the user does in the editor so a developer can read and replay it: pointer, pen and touch events with
 * their coalesced samples, keys, wheel, viewport and focus changes, the document commands passed to `command`, and
 * changes of the state returned by `observe`. Starting exports the document and the presented view, so the events
 * have a known starting point; stopping exports the view again. Events inside elements marked `data-input-recorder`,
 * such as the recorder's own controls, are not recorded.
 *
 * Saving uploads the files to the dev server, which writes them to `apps/paint/recordings/<id>/`; see the recording
 * bridge in `vite.config.ts`. Recording stops by itself after `maxDurationMs`. Must be created within a Solid owner;
 * listeners are attached only while recording.
 */
export function createInputRecorder(options: {
  /** Exports the document as a `.paint` file or the presented view as a PNG; see the engine's `exportFile`. */
  exportFile: (kind: 'document' | 'view') => Promise<Result<Blob, PaintError>>;
  /** Editor state worth following, such as the tool and camera; values must be plain JSON. Tracked while recording. */
  observe: () => Record<string, unknown>;
  /** Longest recording in milliseconds; defaults to ten minutes. */
  maxDurationMs?: number;
}) {
  const [status, setStatus, currentStatus] = createImmediateSignal<'idle' | 'recording' | 'review' | 'saving'>('idle');
  const [now, setNow] = createSignal(0);
  const [saved, setSaved] = createSignal<string>();
  const [failure, setFailure] = createSignal<string>();
  let take: Take | undefined;

  const recording = () => status() === 'recording';
  const target = () => (recording() ? window : undefined);
  createEventListener(
    target,
    [...recordedPointerTypes],
    (event) => outsideRecorder(event) && record(readPointer(event as PointerEvent, time)),
    { capture: true, passive: true }
  );
  createEventListener(
    target,
    ['keydown', 'keyup'],
    (event) => outsideRecorder(event) && record(readKey(event as KeyboardEvent, time)),
    { capture: true, passive: true }
  );
  createEventListener(target, 'wheel', (event) => outsideRecorder(event) && record(readWheel(event, time)), {
    capture: true,
    passive: true
  });
  createEventListener(target, ['blur', 'focus'], (event) => {
    if (event.target === window) {
      record({ time: time(event.timeStamp), kind: 'focus', type: event.type as 'blur' | 'focus' });
    }
  });
  createEventListener(target, 'resize', (event) => {
    const { viewport, devicePixelRatio } = readEnvironment();
    record({ time: time(event.timeStamp), kind: 'viewport', ...viewport, devicePixelRatio });
  });
  createEventListener(
    () => (recording() ? document : undefined),
    'visibilitychange',
    (event) => record({ time: time(event.timeStamp), kind: 'visibility', state: document.visibilityState })
  );
  createEffect(
    () => (recording() ? options.observe() : undefined),
    (state) => {
      if (!state || !take) {
        return;
      }

      const changes = Object.fromEntries(
        Object.entries(state).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(take!.state[key]))
      );
      if (Object.keys(changes).length > 0) {
        take.state = state;
        take.events.push({ time: time(performance.now()), kind: 'state', changes });
      }
    }
  );
  createTimer(
    () => setNow(performance.now()),
    () => recording() && 1000,
    setInterval
  );
  createTimer(stop, () => recording() && (options.maxDurationMs ?? defaultMaxDurationMs), setTimeout);

  return {
    /** `recording`, then `review` until the recording is saved or discarded, `saving` while uploading. */
    status,
    /** Whole seconds recorded so far; updated every second while recording. */
    elapsed: () => (take && recording() ? Math.max(0, Math.floor((now() - take.origin) / 1000)) : 0),
    /** Directory of the last saved recording, relative to the repository, until `acknowledge` or `start`. */
    saved,
    /** Why the last save failed; cleared when a recording starts or is saved. */
    failure,
    start,
    stop,
    save,
    discard,
    acknowledge: () => setSaved(undefined),
    command
  };

  /** Starts a recording; ignored unless idle. Exports the document and the view as they are before any new input. */
  function start() {
    if (currentStatus() !== 'idle') {
      return;
    }

    const origin = performance.now();
    take = {
      id: recordingId(new Date()),
      startedAt: new Date().toISOString(),
      origin,
      environment: readEnvironment(),
      initial: untrack(options.observe),
      state: untrack(options.observe),
      events: [],
      document: options.exportFile('document'),
      startView: options.exportFile('view')
    };
    setSaved(undefined);
    setFailure(undefined);
    setNow(origin);
    setStatus('recording');
  }

  /** Stops recording and exports the final view; the recording waits for `save` or `discard`. */
  function stop() {
    if (!take || currentStatus() !== 'recording') {
      return;
    }

    take.stoppedAt = performance.now();
    take.endView = options.exportFile('view');
    setStatus('review');
  }

  /**
   * Uploads the stopped recording with `note` describing what went wrong, then returns to idle. A failure keeps the
   * recording for another attempt and sets `failure`. Never rejects.
   */
  async function save(note: string) {
    const current = take;
    if (!current || currentStatus() !== 'review') {
      return;
    }

    setStatus('saving');
    const [document, startView, endView] = await Promise.all([
      current.document,
      current.startView,
      current.endView ?? current.startView
    ]);
    const files: Record<string, Blob> = {};
    const names: InputRecording['files'] = {};

    if (document.isOk()) {
      files['start.paint'] = document.value;
      names.document = 'start.paint';
    }

    if (startView.isOk()) {
      files['start.png'] = startView.value;
      names.startView = 'start.png';
    }

    if (current.endView && endView.isOk()) {
      files['end.png'] = endView.value;
      names.endView = 'end.png';
    }

    const recording: InputRecording = {
      version: recordingVersion,
      id: current.id,
      startedAt: current.startedAt,
      duration: Math.max(time(current.stoppedAt ?? performance.now()), current.events.at(-1)?.time ?? 0),
      note: note.trim(),
      build: paintBuild,
      environment: current.environment,
      initial: current.initial,
      files: names,
      events: current.events
    };
    files['recording.json'] = new Blob([JSON.stringify(recording)], { type: 'application/json' });

    try {
      // The description goes last, so a directory with `recording.json` is complete.
      const ordered = Object.entries(files).sort(
        ([a], [b]) => Number(a === 'recording.json') - Number(b === 'recording.json')
      );
      let directory = '';

      for (const [name, blob] of ordered) {
        directory = await upload(current.id, name, blob);
      }

      take = undefined;
      setFailure(undefined);
      setSaved(directory);
      setStatus('idle');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setStatus('review');
    }
  }

  /** Forgets the stopped recording without saving it. */
  function discard() {
    if (currentStatus() !== 'review') {
      return;
    }

    take = undefined;
    setFailure(undefined);
    setStatus('idle');
  }

  /** Records a document command sent by the editor while recording. */
  function command(sent: unknown) {
    if (currentStatus() === 'recording') {
      record({ time: time(performance.now()), kind: 'command', command: abbreviate(sent) });
    }
  }

  function record(event: RecordedEvent) {
    take?.events.push(event);
  }

  /** Converts a `performance.now()` timestamp to milliseconds since the start, to a hundredth of a millisecond. */
  function time(timeStamp: number) {
    return Math.round((timeStamp - (take?.origin ?? timeStamp)) * 100) / 100;
  }
}

/** The recorder's controls and live state. */
export type InputRecorder = ReturnType<typeof createInputRecorder>;

/** A recording from `start` until it is saved or discarded. */
type Take = {
  id: string;
  startedAt: string;
  /** `performance.now()` at the start; event times are relative to it. */
  origin: number;
  stoppedAt?: number;
  environment: InputRecording['environment'];
  initial: Record<string, unknown>;
  /** The last observed state, for reporting changed keys. */
  state: Record<string, unknown>;
  events: RecordedEvent[];
  document: Promise<Result<Blob, PaintError>>;
  startView: Promise<Result<Blob, PaintError>>;
  endView?: Promise<Result<Blob, PaintError>>;
};

/** Whether the event happened outside elements marked `data-input-recorder`, such as the recorder's controls. */
function outsideRecorder(event: Event) {
  return !(event.target instanceof Element && event.target.closest('[data-input-recorder]'));
}

/** A sortable, file-name-safe id from the start time, such as `2026-10-04_12-30-05`. */
function recordingId(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/** Uploads one file of a recording to the dev server and returns the recording's directory. Throws on failure. */
async function upload(id: string, name: string, blob: Blob): Promise<string> {
  const response = await fetch(`${recordingsEndpoint}/${id}/${name}`, { method: 'PUT', body: blob });
  if (response.status === 404) {
    throw new Error('This dev server cannot save recordings. Restart it to load the recording bridge.');
  }

  if (!response.ok) {
    throw new Error(`The dev server did not save ${name}: ${response.status} ${await response.text()}`);
  }

  const { directory } = (await response.json()) as { directory: string };
  return directory;
}

/** Served by the recording bridge in `vite.config.ts` during `vite dev` only. */
const recordingsEndpoint = '/__recordings';

/** Ten minutes of pen input produce tens of megabytes of JSON. */
const defaultMaxDurationMs = 10 * 60_000;
