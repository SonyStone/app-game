/**
 * Completes a cross-browser move only after the destination has acknowledged its import.
 * A destination failure leaves the source untouched; a later source failure leaves a safe duplicate.
 */
export async function executeAcknowledgedHandoff(
  receiveAtDestination: () => Promise<void>,
  removeFromSource: () => Promise<void>
): Promise<void> {
  await receiveAtDestination();
  try {
    await removeFromSource();
  } catch (cause: unknown) {
    throw new CrossBackendHandoffPartialError(cause);
  }
}

/** Reports that the destination accepted a transfer but source cleanup could not finish. */
export class CrossBackendHandoffPartialError extends Error {
  /** Distinguishes the safe-duplicate state from a rejected destination import. */
  readonly destinationAccepted = true;

  constructor(cause: unknown) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    super(`The destination accepted the item, but Browser Atlas could not remove the source. Both copies were kept.${detail}`, {
      cause
    });
    this.name = 'CrossBackendHandoffPartialError';
  }
}
