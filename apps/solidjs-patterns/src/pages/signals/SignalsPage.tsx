import { createSignal, type JSX } from 'solid-js';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { createPatternMarkdownComponents } from '../markdown-components';
import SignalsContent from './signals.md?markdown';

// ============================================================================
// MARK: Signals Page
// ============================================================================

export default function SignalsPage(): JSX.Element {
  return <SignalsContent components={markdownComponents} />;
}

const markdownComponents = createPatternMarkdownComponents({ SignalDemo });

// ============================================================================
// MARK: Live Demo
// ============================================================================

function SignalDemo(): JSX.Element {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal('World');

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400">count:</span>
        <span class="font-mono text-lg font-bold text-violet-300">{count()}</span>
        <Button size="sm" variant="outline" onClick={() => setCount((c) => c - 1)}>
          −
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCount((c) => c + 1)}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCount(0)}>
          reset
        </Button>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-neutral-400">name:</span>
        <input
          class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1 text-sm text-white focus:border-violet-500 focus:outline-none"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <span class="text-sm text-neutral-300">Hello, {name()}!</span>
      </div>
    </Card>
  );
}
