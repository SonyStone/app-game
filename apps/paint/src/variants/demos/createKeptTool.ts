import { createEffect } from 'solid-js';
import type { PaintSession } from '../../features/session';

/**
 * Keeps the whole canvas selected and `tool` chosen, for demos of tools that work only inside a selection, such as
 * the fill and the gradient: Escape or Start over drops the selection, and it comes back at once. Must be created
 * within a Solid owner.
 */
export function createKeptTool(session: PaintSession, tool: 'fill' | 'gradient') {
  const { selection } = session;

  createEffect(
    () => (session.ready() && !selection.isBusy() ? { selected: selection.selected(), tool: session.tool() } : undefined),
    (state) => {
      if (!state) {
        return;
      }

      if (!state.selected) {
        selection.selectAll();
        return;
      }

      if (state.tool !== tool) {
        session.chooseTool(tool);
      }
    }
  );
}
