import type { BrushResourceReader, createBrushResources } from './brushResources';
import type { BrushSession } from './contracts';

/** Gives every engine the same resource lifetime, including engines not using defineBrushEngine.
 * Failed operations cancel transient output; a cancellation failure preserves both errors.
 */
export function createResourceSession(
  cache: ReturnType<typeof createBrushResources>,
  create: (resources: BrushResourceReader) => BrushSession
): BrushSession {
  const scope = cache.open();
  let session: BrushSession;
  try {
    session = create({ get: scope.get });
  } catch (error) {
    scope.release();
    throw error;
  }
  let closed = false;
  const release = () => {
    closed = true;
    scope.release();
  };
  const cancel = () => {
    if (closed) return;
    try {
      session.cancel();
    } finally {
      release();
    }
  };
  const fail = (error: unknown): never => {
    try {
      cancel();
    } catch (cancellation) {
      throw new AggregateError([error, cancellation], 'Brush operation and cancellation both failed.');
    }
    throw error;
  };
  const ensureOpen = () => {
    if (closed) throw new Error('Brush session is closed.');
  };
  return {
    async add(samples) {
      ensureOpen();
      try {
        await session.add(samples);
      } catch (error) {
        fail(error);
      }
    },
    preview(enabled) {
      ensureOpen();
      try {
        session.preview(enabled);
      } catch (error) {
        fail(error);
      }
    },
    async finish() {
      ensureOpen();
      try {
        const changes = await session.finish();
        // Device loss may cancel the session while readback is pending. Never commit its late result.
        ensureOpen();
        release();
        return changes;
      } catch (error) {
        return fail(error);
      }
    },
    cancel
  };
}
