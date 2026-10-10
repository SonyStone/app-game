import { makeEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal } from 'solid-js';
import type { PaintTool } from '../../features/brush';
import type { PaintSession } from '../../features/session';
import type { SketchIconName } from '../../shared/ui/SketchIcon';

/**
 * What the pen does, after "Pen + Touch = New Tools" (Hinckley et al.): the pen only writes, and the free hand decides
 * how. A mode is either latched, and stays until another is chosen, or held: spring-loaded for as long as the free
 * hand's finger holds it, after which the pen returns to the latched mode. A finger that lifts while the pen is
 * still down lets go only when the pen lifts, so a stroke never changes tool halfway, and holding a different mode
 * waits for the pen too.
 *
 * Modes map onto the session: the brush, eraser and lasso choose those tools; the eyedropper and the Mixer Brush's
 * paint pickup arm their next contact again after each pick while held, and run once when latched; the transform
 * starts and is applied when the mode ends; the line, pan and zoom leave the tool alone and are carried out by
 * `createPenDrags`. Tools chosen elsewhere, such as with the keyboard, latch their mode. Must be created within a
 * Solid owner, before any listener that consumes pen presses: it watches pen contacts on the window.
 */
export function createPenModes(session: PaintSession) {
  const { tools, colorPicker, mixer, transform } = session;
  const [mode, setMode] = createSignal<PenMode>('brush');
  const [held, setHeld] = createSignal<PenMode>();
  const [latched, setLatched] = createSignal<PenMode>('brush');
  /** The applied mode, the held one and the latched one as of the last command; signals publish them at the flush. */
  let current: PenMode = 'brush';
  let holding: PenMode | undefined;
  let latchedNow: PenMode = 'brush';
  /** The mode a one-shot latch (eyedropper, paint pickup, transform) returns to. */
  let beforeOneShot: PenMode = 'brush';
  /** The tool this factory chose last, to tell tools chosen elsewhere apart. */
  let chosenTool: PaintTool | undefined;
  /** A release waiting for the pen to lift. */
  let releasePending = false;
  /** Pens and mouse buttons pressed on the drawing. */
  const pens = new Set<number>();
  /** Counts pen presses, so that a gesture can tell whether the pen was used while it held a mode. */
  let presses = 0;

  watchPens();
  followSession();

  return {
    /** What the pen does now: the held mode, or else the latched one. */
    mode,
    /** The mode a finger holds, while it does. */
    held,
    latched,
    /** The modes the free hand offers now: the Mixer Brush's paint pickup only while a Mixer Brush is chosen. */
    offered(): PenMode[] {
      return penModeOrder.filter((candidate) => candidate !== 'mixer' || mixer.available());
    },
    /** Spring-loads `next` while the free hand holds it; `undefined` returns to the latched mode at once. */
    hold(next: PenMode | undefined) {
      if (pens.size > 0) {
        return;
      }

      holding = next;
      releasePending = false;
      setHeld(next);
      apply(next ?? latchedNow);
    },
    /** The finger let go: back to the latched mode, once the pen has lifted. */
    release,
    /** Latches `next`: the pen keeps it until another mode is chosen, or a one-shot mode has run. */
    latch(next: PenMode) {
      if (oneShot.has(next) && !oneShot.has(latchedNow)) {
        beforeOneShot = latchedNow;
      }

      holding = undefined;
      releasePending = false;
      setHeld(undefined);
      latchedNow = next;
      setLatched(next);
      apply(next);
    },
    /** Pen presses so far; compare two readings to learn whether the pen was used in between. */
    presses: () => presses,
    /** A pen or mouse button is pressed on the drawing. */
    penDown: () => pens.size > 0
  };

  function release() {
    if (!holding) {
      return;
    }

    if (pens.size > 0) {
      releasePending = true;
      return;
    }

    holding = undefined;
    releasePending = false;
    setHeld(undefined);
    apply(latchedNow);
  }

  /** Leaves the applied mode for `next` and tells the session. */
  function apply(next: PenMode) {
    if (next !== current) {
      leave(current);
      current = next;
      enter(next);
    }

    setMode(next);
  }

  function enter(next: PenMode) {
    if (next === 'brush' || next === 'eraser' || next === 'lasso') {
      choose(next);
    } else if (next === 'line') {
      // A line paints with the brush tool in use: the brush, or the eraser after erasing.
      choose(tools.slot());
    } else if (next === 'eyedropper') {
      colorPicker.arm();
    } else if (next === 'mixer') {
      mixer.pick();
    } else if (next === 'transform' && !transform.active()) {
      session.toggleTransform();
    }
  }

  function leave(previous: PenMode) {
    if (previous === 'eyedropper') {
      colorPicker.cancel();
    } else if (previous === 'mixer') {
      mixer.cancelPick();
    } else if (previous === 'transform' && transform.active()) {
      void transform.end();
    }
  }

  function choose(tool: PaintTool) {
    chosenTool = tool;
    session.chooseTool(tool);
  }

  /** Returns from a one-shot mode that finished on its own, unless a finger still holds it. */
  function finishOneShot(finished: PenMode) {
    if (current !== finished || holding === finished) {
      return false;
    }

    latchedNow = beforeOneShot;
    setLatched(beforeOneShot);
    apply(beforeOneShot);
    return true;
  }

  /** Counts pen and mouse presses on the drawing; a pending release happens when the last one lifts. */
  function watchPens() {
    const capture = { capture: true };
    makeEventListener(
      window,
      'pointerdown',
      (event) => {
        if (event.pointerType === 'touch' || event.button !== 0) {
          return;
        }

        if (event.target instanceof Node && session.stage()?.contains(event.target)) {
          pens.add(event.pointerId);
          presses++;
        }
      },
      capture
    );
    const lift = (event: PointerEvent) => {
      if (!pens.delete(event.pointerId) || pens.size > 0 || !releasePending) {
        return;
      }

      release();
    };
    makeEventListener(window, 'pointerup', lift, capture);
    makeEventListener(window, 'pointercancel', lift, capture);
  }

  /** Follows changes the session makes on its own or through other controls. */
  function followSession() {
    // A tool chosen elsewhere (keyboard, selection bar) latches its mode.
    createEffect(tools.tool, (tool) => {
      if (tool === chosenTool) {
        return;
      }

      chosenTool = tool;
      const next = toolModes[tool];
      holding = undefined;
      releasePending = false;
      setHeld(undefined);
      leave(current);
      current = next;
      latchedNow = next;
      setLatched(next);
      setMode(next);
    });
    // While held, the eyedropper and the paint pickup arm the next contact again; latched, they run once. A tool
    // chosen elsewhere also disarms them; the effect above follows that change instead.
    createEffect(
      () => ({ armed: colorPicker.armed(), tool: tools.tool() }),
      ({ armed, tool }) => {
        if (!armed && current === 'eyedropper' && tool === chosenTool && !finishOneShot('eyedropper')) {
          colorPicker.arm();
        }
      }
    );
    createEffect(
      () => ({ picking: mixer.picking(), tool: tools.tool() }),
      ({ picking, tool }) => {
        if (!picking && current === 'mixer' && tool === chosenTool && !finishOneShot('mixer') && mixer.available()) {
          mixer.pick();
        }
      }
    );
    // A transform applied or cancelled with its own buttons ends a latched transform mode.
    createEffect(
      () => ({ active: transform.active(), tool: tools.tool() }),
      ({ active, tool }) => {
        if (!active && current === 'transform' && tool === chosenTool) {
          finishOneShot('transform');
        }
      }
    );
  }
}

/** The pen modes; see `createPenModes`. */
export type PenModes = ReturnType<typeof createPenModes>;

/** What the pen can do. */
export type PenMode = 'brush' | 'eraser' | 'eyedropper' | 'mixer' | 'lasso' | 'line' | 'transform' | 'zoom' | 'pan';

/** Names, icons and keys of the pen modes, for the ring and the status line; see also `ModeIcon`. */
export const penModeInfo: Record<PenMode, { label: string; icon: SketchIconName; key?: string }> = {
  brush: { label: 'Brush', icon: 'brush', key: 'B' },
  eraser: { label: 'Eraser', icon: 'erase', key: 'E' },
  eyedropper: { label: 'Eyedropper', icon: 'picker', key: 'I' },
  mixer: { label: 'Load paint', icon: 'fill' },
  lasso: { label: 'Lasso', icon: 'lasso', key: 'L' },
  line: { label: 'Line', icon: 'draw' },
  transform: { label: 'Transform', icon: 'distort' },
  zoom: { label: 'Zoom', icon: 'zoom' },
  pan: { label: 'Pan', icon: 'pan' }
};

/** The ring's order, from the top of the fan. */
const penModeOrder: readonly PenMode[] = [
  'brush',
  'eraser',
  'eyedropper',
  'mixer',
  'lasso',
  'line',
  'transform',
  'zoom',
  'pan'
];

/** Modes that, latched, run once and return to the mode before them. */
const oneShot = new Set<PenMode>(['eyedropper', 'mixer', 'transform']);

/** The mode of a tool chosen elsewhere; the fill and the gradient work inside the selection, as the lasso does. */
const toolModes: Record<PaintTool, PenMode> = {
  brush: 'brush',
  eraser: 'eraser',
  lasso: 'lasso',
  fill: 'lasso',
  gradient: 'lasso'
};
