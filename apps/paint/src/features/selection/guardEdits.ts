import type { PaintCommand } from '@app-game/paint-core/protocol';
import type { Selection } from './createSelection';

/**
 * Wraps engine commands so document edits respect the lasso: while a selection edit applies, only view, selection and
 * setting commands pass; drawing, history, layer, module edit, import and recovery commands also remove the outline
 * first.
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

const clearsOutline = new Set<PaintCommand['type']>(['begin', 'undo', 'redo', 'layer', 'edit', 'import', 'recover']);
