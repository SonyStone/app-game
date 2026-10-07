import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup } from 'solid-js';

/** One reading of GodSVG-style debug measurements; memory is Chromium-only (`performance.memory`). */
export type DebugReading = {
  readonly fps: number;
  readonly domNodes: number;
  readonly heapUsed: number | undefined;
  readonly heapTotal: number | undefined;
  readonly heapLimit: number | undefined;
};

/**
 * GodSVG's debug readout: frames per second and memory, refreshed every second, plus the last five input events
 * (repeats counted). Stops when its owner is disposed.
 */
export function createDebugMeter() {
  const [reading, setReading] = createSignal<DebugReading>({ fps: 0, domNodes: 0, heapUsed: undefined, heapTotal: undefined, heapLimit: undefined });
  const [inputs, setInputs] = createSignal<readonly string[]>([]);
  let frames = 0;
  let frame = requestAnimationFrame(function count() {
    frames += 1;
    frame = requestAnimationFrame(count);
  });
  const timer = setInterval(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    setReading({
      fps: frames,
      domNodes: document.getElementsByTagName('*').length,
      heapUsed: memory?.usedJSHeapSize,
      heapTotal: memory?.totalJSHeapSize,
      heapLimit: memory?.jsHeapSizeLimit
    });
    frames = 0;
  }, 1000);

  onCleanup(() => {
    cancelAnimationFrame(frame);
    clearInterval(timer);
  });

  const record = (text: string) =>
    setInputs((current) => {
      const last = current.at(-1);
      const match = last?.match(/^(.*) \((\d+)\)$/);
      const base = match?.[1] ?? last;

      if (base === text) {
        return [...current.slice(0, -1), `${text} (${Number(match?.[2] ?? 1) + 1})`];
      }

      return [...current, text].slice(-5);
    });

  createEventListener(window, 'keydown', (event) => record(keyText(event)), { capture: true });
  createEventListener(window, 'pointerdown', (event) => record(`${event.pointerType} button ${event.button} (${event.clientX}, ${event.clientY})`), {
    capture: true
  });

  return { reading, inputs };
}

function keyText(event: KeyboardEvent): string {
  return [event.ctrlKey && 'Ctrl', event.metaKey && 'Meta', event.altKey && 'Alt', event.shiftKey && 'Shift', event.key].filter(Boolean).join('+');
}
