import { Show } from 'solid-js';
import type { WorkerFailure } from '../psd-worker';

/** Explains resource admission separately from file corruption and offers a strict retry without raising limits. */
export function OpenFailure(props: {
  name: string;
  failure: WorkerFailure;
  class?: string;
  /** Retries the retained source through the strict reader. Saved pixels are offered only when decoding succeeds. */
  onStrict: () => void;
}) {
  const resource = () => props.failure.kind === 'budget' || props.failure.kind === 'allocation';
  const amounts = () => {
    const error = props.failure;
    if (error.kind === 'budget') {
      return `${readableAmount(error.requested, error.resource)} requested; limit ${readableAmount(error.limit, error.resource)}.`;
    }

    return error.kind === 'allocation' ? `${readableAmount(error.requested, 'bytes')} could not be allocated.` : '';
  };

  return (
    <div class={props.class} role="alert" data-failure={props.failure.kind}>
      <p>
        {props.name}{props.failure.kind === 'refused' ? ': ' : ' failed to open: '}{props.failure.message}
      </p>
      <Show when={resource()}>
        <p>{amounts()} The file exceeds the current memory limits. Limits have not been raised.</p>
        <p>
          Strict reading skips Photoshop recovery and repairs. Its layers may differ from Photoshop's recovered opening.
          A saved preview, when available, shows the last saved composite and may be stale.
        </p>
        <button type="button" onClick={props.onStrict}>
          Retry strict reading
        </button>
      </Show>
    </div>
  );
}

/** Formats byte budgets in MiB while preserving non-byte resource counts. */
function readableAmount(value: bigint, resource: string) {
  return resource.includes('bytes') ? `${(Number(value) / 1_048_576).toFixed(1)} MiB` : value.toLocaleString();
}
