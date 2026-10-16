import { createEffect, createSignal } from 'solid-js';
import type { PaintSession } from '../../features/session';
import type { ViewMode } from './viewDrag';

/**
 * The tools of the Desktop variant's tool column on top of the session's: the session's brush, eraser, selection
 * (lasso and wand), fill and gradient, plus the transform, the one-shot eyedropper and the view tools (hand, zoom,
 * rotate), which only this variant has. `active` is the tool whose options the options bar shows.
 *
 * The fill and the gradient work inside a selection; chosen without one, they first select everything and are chosen
 * once the selection exists. Must be created within a Solid owner.
 */
export function createDesktopTools(session: PaintSession) {
  const { tool, transform, colorPicker, selection } = session;
  const [viewMode, setViewMode] = createSignal<ViewMode>();
  /** A fill or gradient waiting for Select All to finish. */
  const [pending, setPending] = createSignal<'fill' | 'gradient'>();

  createEffect(
    () => (selection.selected() && !selection.busy() ? pending() : undefined),
    (waiting) => {
      if (waiting) {
        setPending(undefined);
        session.chooseTool(waiting);
      }
    }
  );

  return {
    /** The tool in use, as the tool column highlights it. */
    active(): DesktopTool {
      if (transform.active()) {
        return 'transform';
      }

      if (colorPicker.armed()) {
        return 'eyedropper';
      }

      if (viewMode()) {
        return 'view';
      }

      const current = tool();
      return current === 'lasso' ? 'select' : current;
    },
    /** The view tool in use; undefined while another tool is. */
    viewMode,
    chooseView,
    choose(next: DesktopTool) {
      if (next === 'view') {
        chooseView(viewMode() ?? 'hand');
        return;
      }

      setViewMode(undefined);
      setPending(undefined);
      if (next === 'transform') {
        if (!transform.active()) {
          session.toggleTransform();
        }

        return;
      }

      if (next === 'eyedropper') {
        if (transform.active()) {
          void transform.end();
        }

        colorPicker.arm();
        return;
      }

      colorPicker.cancel();
      if (next === 'local-undo') {
        session.chooseLocalUndo();
        return;
      }

      const paintTool = next === 'select' ? 'lasso' : next;
      if ((paintTool === 'fill' || paintTool === 'gradient') && !selection.selected()) {
        setPending(paintTool);
        selection.selectAll();
        return;
      }

      session.chooseTool(paintTool);
    },
    /** Leaves the view tool, as the session's own tool shortcuts do. */
    leaveView() {
      setViewMode(undefined);
    }
  };

  /** Chooses the view tool `mode`: the canvas then pans, zooms or rotates instead of painting. */
  function chooseView(mode: ViewMode) {
    if (transform.active()) {
      void transform.end();
    }

    colorPicker.cancel();
    setViewMode(mode);
  }
}

/** The tools of the tool column. */
export type DesktopTool =
  | 'brush'
  | 'eraser'
  | 'select'
  | 'fill'
  | 'gradient'
  | 'local-undo'
  | 'transform'
  | 'eyedropper'
  | 'view';

/** The variant's tools; see `createDesktopTools`. */
export type DesktopTools = ReturnType<typeof createDesktopTools>;
