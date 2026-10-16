import type { Point } from '@app-game/paint-core/camera';
import type { CanvasContact } from '@app-game/paint-core/input';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { StrokePoint } from '@app-game/paint-core/selectionMask';
import type { Result } from 'neverthrow';
import { createEffect, createSignal, getOwner, isDisposed, onCleanup, untrack } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintError } from '../../shared/errors';
import { localUndoEdit, type LocalUndoCommand, type LocalUndoReply } from './localUndoEdit';

/**
 * The UI half of the local undo, whose engine half is `localUndoEdit` in the drawing engine's recipe: its settings,
 * remembered in `localStorage`, one session at a time, and the canvas contact that marks the region in the chosen
 * mode. A pen or mouse paints the region with the mask brush (pressure sets the size), outlines it with the lasso, or
 * taps strokes away; touch keeps navigating. Shift adds a lasso outline, Alt subtracts one or erases with the brush.
 *
 * Commands run one at a time in sending order. Brush dabs reach the engine at most once a frame and once more on
 * release, and depth changes send only the latest, while the gesture itself draws at once. The session ends with
 * `apply`, which keeps the result as one undo step, or `cancel`; choosing another tool applies, and anything else
 * that changes the document, Redo and a stroke of the pen's eraser end included, ends it without changes, as the
 * engine then drops the preview. Must be created within a Solid owner; replies after disposal are dropped.
 */
export function createLocalUndo(options: {
  /** The local undo tool is active. */
  active: () => boolean;
  /** Runs an edit and resolves its reply; see `PaintEngine.runEdit`. */
  run: (command: Extract<PaintCommand, { type: 'edit' }>) => Promise<Result<unknown, PaintError>>;
  /** Whether a session can start or continue: the engine accepts edits and no stroke or other edit runs. */
  canStart: () => boolean;
  /** The document's revision as the engine reports it; see `DocumentEditContext.revision`. */
  revision: () => number;
  onError: (error: PaintError) => void;
}) {
  const owner = getOwner()!;
  const [settings, setSettings, currentSettings] = createImmediateSignal<LocalUndoSettings>(readSettings());
  const [depth, setDepth, currentDepth] = createImmediateSignal(1);
  /** What the open session shows, once the engine replied; see `open`. */
  const [shown, setShown] = createSignal<LocalUndoReply>();
  const [gesture, setGesture] = createSignal<LocalUndoGesture>();
  /** A session is open: its first command was sent and neither `apply` nor `cancel` followed. */
  const [open, setOpen, currentOpen] = createImmediateSignal(false);
  /** Commands in sending order; each starts after the previous one's reply. */
  let chain: Promise<unknown> = Promise.resolve();
  /** Counts sessions, so that replies of a closed session do not show. */
  let generation = 0;
  /** The brush stroke in progress: dabs not sent yet, the last one sent, whether it erases and has ended. */
  let brushing: { pending: StrokePoint[]; last?: StrokePoint; erase: boolean; ended?: boolean } | undefined;
  let lassoing: { points: Point[]; mode: 'replace' | 'add' | 'subtract' } | undefined;
  /** A brush command is waiting for its reply. */
  let sending = false;
  let frame: number | undefined;
  /** The latest depth waiting in `chain`; later changes replace it. */
  let queuedDepth: number | undefined;

  // Choosing another tool applies the session.
  createEffect(options.active, (active) => {
    if (!active) {
      void untrack(apply);
    }
  });
  // Anything else that changed the document ended the session in the engine. The reply carries the revision the
  // engine saw, so a report of an earlier change arriving late does not end a session made after it; the reply is
  // therefore read, not tracked.
  createEffect(options.revision, (revision) => {
    const current = untrack(shown);
    if (untrack(currentOpen) && current && revision !== current.revision) {
      close();
      send({ type: 'cancel' });
    }
  });
  onCleanup(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });

  return {
    settings,
    /** Changes the settings and remembers them; a mode that works differently applies the session first. */
    update(patch: Partial<LocalUndoSettings>) {
      const previous = currentSettings();
      const next = { ...previous, ...patch };
      if (kindOf(next.mode) !== kindOf(previous.mode)) {
        void apply();
      }

      setSettings(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Settings are a convenience; keep them for this page.
      }
    },
    /** How many touching steps back a marked region returns; 1 for each new session. */
    depth,
    /** Shows the region as it was before the `next`-th newest step that touched it. */
    setDepth(next: number) {
      setDepth(next);
      if (!currentOpen() || kindOf(currentSettings().mode) !== 'region') {
        return;
      }

      const waiting = queuedDepth !== undefined;
      queuedDepth = next;
      if (!waiting) {
        chain = chain.then(() => {
          const latest = queuedDepth!;
          queuedDepth = undefined;
          return request({ type: 'depth', depth: latest });
        });
      }
    },
    /** A session is open. */
    open,
    /** What the open session shows: its depth or removed steps and its outline, once the engine replied. */
    shown,
    /** The brush stroke or lasso outline being drawn, in document pixels. */
    gesture,
    apply,
    cancel,
    /** Canvas contact handler of the active tool; see the factory's description. */
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'pointerType'>) => options.active() && event.pointerType !== 'touch',
      run(point: Point, contact: CanvasContact) {
        if (!options.canStart()) {
          return;
        }

        const { mode, area } = currentSettings();
        if (mode === 'tap') {
          setOpen(true);
          send({ type: 'tap', point });
          return;
        }

        if (mode === 'lasso') {
          // Modifier keys override the area setting.
          const chosen = contact.shiftKey ? 'add' : contact.altKey ? 'remove' : area;
          const combine = chosen === 'add' ? 'add' : chosen === 'remove' ? 'subtract' : 'replace';
          lassoing = { points: [point], mode: combine };
          setGesture({ kind: 'lasso', ...lassoing });
          return;
        }

        const erase = !contact.shiftKey && (contact.altKey || area === 'remove');
        brushing = { pending: [dab(point, contact)], erase };
        setGesture({ kind: 'brush', points: [...brushing.pending], erase: brushing.erase });
        scheduleBrush();
      },
      move(point: Point, contact: CanvasContact) {
        if (lassoing) {
          lassoing.points.push(point);
          setGesture({ kind: 'lasso', ...lassoing, points: [...lassoing.points] });
        } else if (brushing) {
          brushing.pending.push(dab(point, contact));
          const current = gesture();
          setGesture({
            kind: 'brush',
            points: [...(current?.kind === 'brush' ? current.points : []), brushing.pending.at(-1)!],
            erase: brushing.erase
          });
          scheduleBrush();
        }
      },
      end(cancelled: boolean) {
        const lasso = lassoing;
        lassoing = undefined;
        setGesture(undefined);
        if (lasso && !cancelled && lasso.points.length >= 3 && options.canStart()) {
          setOpen(true);
          send({ type: 'lasso', points: lasso.points, mode: lasso.mode, depth: currentDepth() });
        }

        if (brushing) {
          if (cancelled) {
            brushing.pending = [];
          }

          // The rest of the stroke goes at once; `sendBrush` drops the stroke once nothing is pending.
          sendBrush(true);
        }
      }
    }
  };

  /** Keeps the shown result as one undo step and ends the session. */
  async function apply() {
    await finish('apply');
  }

  /** Ends the session without changes. */
  async function cancel() {
    await finish('cancel');
  }

  async function finish(type: 'apply' | 'cancel') {
    if (!currentOpen()) {
      return;
    }

    close();
    await send({ type });
  }

  /** Forgets the session in the editor; its later replies are dropped. */
  function close() {
    generation++;
    brushing = undefined;
    lassoing = undefined;
    setGesture(undefined);
    setOpen(false);
    setShown(undefined);
    setDepth(1);
  }

  /** A brush dab at `point`, its size following the pen pressure. */
  function dab(point: Point, contact: CanvasContact): StrokePoint {
    return { ...point, radius: Math.max(0.5, (currentSettings().size / 2) * contact.pressure) };
  }

  /** Sends pending dabs at the next frame. */
  function scheduleBrush() {
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      sendBrush(false);
    });
  }

  /**
   * Sends the dabs drawn since the last command, unless one is still waiting for its reply, which sends them when it
   * arrives. Each part repeats the previous part's last dab, so the stroke stays continuous. `ended` drops the stroke
   * once everything is sent.
   */
  function sendBrush(ended: boolean) {
    const stroke = brushing;
    if (!stroke) {
      return;
    }

    if (ended) {
      stroke.ended = true;
    }

    if (sending || !stroke.pending.length || !options.canStart()) {
      if (!sending && stroke.ended) {
        brushing = undefined;
        setGesture(undefined);
      }

      return;
    }

    const points = [...(stroke.last ? [stroke.last] : []), ...stroke.pending];
    stroke.last = stroke.pending.at(-1);
    stroke.pending = [];
    sending = true;
    setOpen(true);
    const { hardness } = currentSettings();
    void send({ type: 'brush', points, hardness, erase: stroke.erase, depth: currentDepth() }).finally(() => {
      sending = false;
      if (brushing === stroke) {
        sendBrush(false);
      }
    });
  }

  /** Queues `command` behind the earlier ones. */
  function send(command: LocalUndoCommand) {
    const sent = chain.then(() => request(command));
    chain = sent;
    return sent;
  }

  /** Runs `command` and shows its reply while its session is open. */
  async function request(command: LocalUndoCommand) {
    const session = generation;
    const result = await options.run(localUndoEdit.command(command));
    if (isDisposed(owner)) {
      return;
    }

    if (result.isErr()) {
      options.onError(result.error);
      return;
    }

    if (session === generation && result.value) {
      setShown(result.value as LocalUndoReply);
    }
  }
}

/** The local undo state and canvas action. */
export type LocalUndo = ReturnType<typeof createLocalUndo>;

/** A gesture marking the region, drawn over the canvas until it reaches the engine. */
export type LocalUndoGesture =
  | { kind: 'brush'; points: StrokePoint[]; erase: boolean }
  | { kind: 'lasso'; points: Point[]; mode: 'replace' | 'add' | 'subtract' };

/**
 * Local undo settings: how the region is marked, how a brush stroke or lasso outline combines with it without
 * modifier keys (`new` replaces it with an outline and adds a brush stroke), and the mask brush's diameter in document
 * pixels and hardness from 0 to 1. The three modes are there to compare them with a pen. `area` stands in for Shift
 * and Alt on a tablet without a keyboard; held modifier keys win over it.
 */
export type LocalUndoSettings = {
  mode: 'brush' | 'lasso' | 'tap';
  area: 'new' | 'add' | 'remove';
  size: number;
  hardness: number;
};

/**
 * Brush and lasso both mark a region and can continue each other's session; taps collect strokes, a session of another
 * kind, so switching to or from the tap applies the open session first.
 */
function kindOf(mode: LocalUndoSettings['mode']) {
  return mode === 'tap' ? 'taps' : 'region';
}

const storageKey = 'paint.local-undo';

const defaultSettings: LocalUndoSettings = { mode: 'brush', area: 'new', size: 80, hardness: 0.5 };

/** Stored settings, with defaults for missing or invalid values. */
function readSettings(): LocalUndoSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    const number = (value: unknown, min: number, max: number, fallback: number) =>
      typeof value === 'number' && value >= min && value <= max ? value : fallback;
    return {
      mode: record.mode === 'lasso' || record.mode === 'tap' ? record.mode : 'brush',
      area: record.area === 'add' || record.area === 'remove' ? record.area : 'new',
      size: number(record.size, 1, maxLocalUndoBrush, defaultSettings.size),
      hardness: number(record.hardness, 0, 1, defaultSettings.hardness)
    };
  } catch {
    return defaultSettings;
  }
}

/** Largest diameter of the mask brush in document pixels. */
export const maxLocalUndoBrush = 2000;
