import { createSignal, Match, Show, Switch, type JSX } from 'solid-js';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { markdownComponents } from '../markdown-components';
import ControlFlowContent from './control-flow.md?markdown';

export default function ControlFlowPage(): JSX.Element {
  return <ControlFlowContent components={{ ...markdownComponents, ControlFlowDemo }} />;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

function ControlFlowDemo(): JSX.Element {
  const [status, setStatus] = createSignal<Status>('idle');
  const [showDetails, setShowDetails] = createSignal(false);

  const simulate = async (outcome: 'success' | 'error') => {
    setStatus('loading');
    await new Promise((r) => setTimeout(r, 800));
    setStatus(outcome);
  };

  return (
    <Card class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setStatus('idle')}>
          Reset
        </Button>
        <Button size="sm" variant="default" onClick={() => simulate('success')}>
          Simulate Success
        </Button>
        <Button size="sm" variant="outline" onClick={() => simulate('error')}>
          Simulate Error
        </Button>
      </div>

      <Switch fallback={<StatusBadge label="idle" variant="secondary" />}>
        <Match when={status() === 'loading'}>
          <StatusBadge label="loading…" variant="warning" />
        </Match>
        <Match when={status() === 'success'}>
          <div class="flex flex-col gap-2">
            <StatusBadge label="success" variant="success" />
            <button
              class="self-start text-xs text-violet-400 hover:underline"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails() ? 'hide' : 'show'} details
            </button>
            <Show when={showDetails()}>
              <div class="rounded-lg bg-neutral-950 p-3 text-xs text-green-400">✓ Data loaded successfully</div>
            </Show>
          </div>
        </Match>
        <Match when={status() === 'error'}>
          <StatusBadge label="error" variant="destructive" />
        </Match>
      </Switch>
    </Card>
  );
}

function StatusBadge(props: {
  label: string;
  variant: 'secondary' | 'warning' | 'success' | 'destructive';
}): JSX.Element {
  return (
    <div class="flex items-center gap-2">
      <span class="text-xs text-neutral-500">status:</span>
      <Badge variant={props.variant}>{props.label}</Badge>
    </div>
  );
}
