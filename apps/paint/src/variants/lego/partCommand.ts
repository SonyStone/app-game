import { errorMessage } from '@app-game/solid-gpu/errors';
import type { PaintSession } from '../../features/session';
import { engineError } from '../../shared/errors';

/** Reports synchronous and asynchronous part command failures through the session's error notice. */
export function runPartCommand(session: PaintSession, command: () => unknown) {
  const report = (cause: unknown) => session.setError(engineError('failed', errorMessage(cause), cause));
  try {
    const result = command();
    if (result instanceof Promise) {
      void result.catch(report);
    }
  } catch (cause) {
    report(cause);
  }
}
