import { batch, createEffect, createSignal, type JSX } from 'solid-js';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import BatchingContent from './batching.md?markdown';

export default function BatchingPage(): JSX.Element {
  return <BatchingContent components={{ ...markdownComponents, BatchDemo }} />;
}

function BatchDemo(): JSX.Element {
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [effectRunCount, setEffectRunCount] = createSignal(0);
  const [logs, setLogs] = createSignal<string[]>([]);

  createEffect(() => {
    const xv = x();
    const yv = y();
    setEffectRunCount((c) => c + 1);
    setLogs((prev) => [`effect #${effectRunCount() + 1}: x=${xv}, y=${yv}`, ...prev].slice(0, 6));
  });

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setX((v) => v + 1);
            setY((v) => v + 1);
          }}
        >
          set x+y (no batch — 2 effects)
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() =>
            batch(() => {
              setX((v) => v + 1);
              setY((v) => v + 1);
            })
          }
        >
          set x+y (batch — 1 effect)
        </Button>
      </div>
      <div class="flex gap-6 font-mono text-sm">
        <span>
          <span class="text-neutral-500">x=</span>
          <span class="text-violet-300">{x()}</span>
        </span>
        <span>
          <span class="text-neutral-500">y=</span>
          <span class="text-violet-300">{y()}</span>
        </span>
        <span>
          <span class="text-neutral-500">effects run=</span>
          <span class="text-yellow-400">{effectRunCount()}</span>
        </span>
      </div>
      <div class="space-y-0.5 rounded-lg bg-neutral-950 p-3 font-mono text-xs text-neutral-400">
        {logs().map((l) => (
          <div>{l}</div>
        ))}
      </div>
    </Card>
  );
}
