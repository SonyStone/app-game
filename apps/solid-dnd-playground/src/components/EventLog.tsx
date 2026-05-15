import { createSignal, For, Show, type Accessor, type JSX } from 'solid-js';

// ============================================================================
// MARK: Types
// ============================================================================

export type EventLogger = {
  /** The log entries (reactive). */
  log: Accessor<string[]>;
  /** Append a message to the log. Auto-scrolls the log element. */
  addLog: (msg: string) => void;
  /** Clear all entries. */
  clear: () => void;
  /** Set the ref to the scrollable container (called internally by EventLog). */
  setScrollRef: (el: HTMLDivElement) => void;
};

// ============================================================================
// MARK: createEventLogger
// ============================================================================

/**
 * Creates a standalone event logger with auto-scroll support.
 *
 * @param maxEntries Maximum number of entries to keep. Default: 100.
 *
 * @example
 * ```tsx
 * const logger = createEventLogger();
 * logger.addLog('▶ START');
 * return <EventLog logger={logger} />;
 * ```
 */
export function createEventLogger(maxEntries = 100): EventLogger {
  const [log, setLog] = createSignal<string[]>([]);
  let scrollEl: HTMLDivElement | undefined;

  function addLog(msg: string): void {
    setLog((prev) => [...prev, msg].slice(-maxEntries));
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  }

  function clear(): void {
    setLog([]);
  }

  function setScrollRef(el: HTMLDivElement): void {
    scrollEl = el;
  }

  return { log, addLog, clear, setScrollRef };
}

// ============================================================================
// MARK: EventLog Component
// ============================================================================

export type EventLogProps = {
  logger: EventLogger;
  /** Fixed height CSS class. Default: 'h-48'. */
  heightClass?: string;
};

export default function EventLog(props: EventLogProps): JSX.Element {
  const { log, clear, setScrollRef } = props.logger;

  return (
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-xs font-semibold text-neutral-400">Event Log</h3>
        <div class="flex gap-2">
          <button
            class="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
            onClick={() => navigator.clipboard.writeText(log().join('\n'))}
          >
            Copy
          </button>
          <button
            class="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
            onClick={clear}
          >
            Clear
          </button>
        </div>
      </div>
      <div
        ref={setScrollRef}
        class={`overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs ${props.heightClass ?? 'h-48'}`}
      >
        <Show when={log().length > 0} fallback={<div class="text-neutral-600">No events yet — drag something!</div>}>
          <For each={log()}>
            {(entry) => (
              <div
                class={`py-0.5 ${
                  entry.startsWith('▶')
                    ? 'text-green-400'
                    : entry.startsWith('■')
                      ? 'text-yellow-400'
                      : entry.startsWith('✕')
                        ? 'text-red-400'
                        : 'text-neutral-400'
                }`}
              >
                {entry}
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
