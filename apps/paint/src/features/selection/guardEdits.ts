import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { Selection } from './createSelection';

/**
 * Wraps engine commands so document edits respect the lasso: while a selection edit applies, only view, selection and
 * setting commands pass. The outline outlasts drawing, history, layer and module edits, as in Photoshop, so the fill
 * and the gradient can keep working inside it; opening a drawing or recovering the renderer removes it first.
 */
export function guardEdits<Command extends PaintCommand>(
  selection: Pick<Selection, 'isBusy' | 'clear'>,
  send: (command: Command) => void
) {
  return (command: Command) => {
    if (selection.isBusy() && !allowedWhileApplying.has(command.type)) {
      return;
    }

    if (clearsOutline.has(command.type)) {
      selection.clear();
    }

    send(command);
  };
}

const allowedWhileApplying = new Set<PaintCommand['type']>([
  'selection',
  'selection-view',
  'view',
  'debug',
  'live-tail'
]);

const clearsOutline = new Set<PaintCommand['type']>(['import', 'recover']);
