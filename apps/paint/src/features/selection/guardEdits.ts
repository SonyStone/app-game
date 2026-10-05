import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { Selection } from './createSelection';

/**
 * Wraps engine commands so document edits respect the selection: while a selection change or pixel command applies,
 * only view, selection and setting commands pass. The selection outlasts drawing, history, layer and module edits, as
 * in Photoshop, so the fill and the gradient can keep working inside it; opening a drawing, which removes it in the
 * engine, or recovering the renderer first ends a selection gesture in progress.
 */
export function guardEdits<Command extends PaintCommand>(
  selection: Pick<Selection, 'isBusy' | 'cancel'>,
  send: (command: Command) => void
) {
  return (command: Command) => {
    if (selection.isBusy() && !allowedWhileApplying.has(command.type)) {
      return;
    }

    if (endsGesture.has(command.type)) {
      selection.cancel();
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

const endsGesture = new Set<PaintCommand['type']>(['import', 'recover']);
