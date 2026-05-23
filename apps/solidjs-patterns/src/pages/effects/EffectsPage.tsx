import { createEffect, createSignal, type JSX } from 'solid-js';
import { Card } from '../../components/ui/Card';
import { createPatternMarkdownComponents } from '../markdown-components';
import EffectsContent from './effects.md?markdown';

// ============================================================================
// MARK: Effects Page
// ============================================================================

export default function EffectsPage(): JSX.Element {
  return <EffectsContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents({
  EffectsDemo
});

// ============================================================================
// MARK: Live Demo
// ============================================================================

function EffectsDemo(): JSX.Element {
  const [logs, setLogs] = createSignal<string[]>([]);
  const [count, setCount] = createSignal(0);

  const addLog = (msg: string) =>
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));

  createEffect(() => {
    const c = count();
    if (c === 0) {
      addLog('effect ran: count = 0 (initial)');
    } else {
      addLog(`effect ran: count changed to ${c}`);
    }
  });

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400">count: </span>
        <span class="font-mono font-bold text-violet-300">{count()}</span>
        <button
          class="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
          onClick={() => setCount((c) => c + 1)}
        >
          increment
        </button>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-[10px] font-semibold tracking-wider text-neutral-600 uppercase">Effect log</span>
        <div class="space-y-0.5 rounded-lg bg-neutral-950 p-3 font-mono text-xs text-neutral-400">
          {logs().map((log) => (
            <div>{log}</div>
          ))}
        </div>
      </div>
    </Card>
  );
}
