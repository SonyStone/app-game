import { For, type JSX } from 'solid-js';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { markdownComponents } from '../markdown-components';
import OwnerComputationContent from './owner-computation.md?markdown';

export default function OwnerComputationPage(): JSX.Element {
  return (
    <OwnerComputationContent
      components={{
        ...markdownComponents,
        PrimitiveGrid(): JSX.Element {
          return (
            <div class="grid gap-3 lg:grid-cols-2">
              <For each={PRIMITIVE_NOTES}>{(note) => <PrimitiveCard note={note} />}</For>
            </div>
          );
        },
        ShortVersionCard(): JSX.Element {
          return (
            <Card class="flex flex-col gap-2 text-base leading-6 dark:text-slate-300">
              <div>
                <span class="font-semibold text-slate-100">Short version:</span> computations create child owners, but
                not every owner is a computation.
              </div>
            </Card>
          );
        },
        ReferenceCard(props: { children: JSX.Element }): JSX.Element {
          return (
            <ul class="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4">{props.children}</ul>
          );
        },
        ReferenceLink(props: { href: string; children: JSX.Element }): JSX.Element {
          return (
            <li>
              <a
                href={props.href}
                target="_blank"
                rel="noreferrer"
                class="text-base text-violet-300 underline decoration-violet-800 underline-offset-4 transition-colors hover:text-violet-200"
              >
                {props.children}
              </a>
            </li>
          );
        }
      }}
    />
  );
}

type PrimitiveNote = {
  name: string;
  purity: 'pure' | 'not pure';
  timing: string;
  summary: string;
};

function PrimitiveCard(props: { note: PrimitiveNote }): JSX.Element {
  return (
    <Card class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <h3 class="text-base font-semibold text-slate-100">{props.note.name}</h3>
        <Badge variant={props.note.purity === 'pure' ? 'success' : 'warning'}>{props.note.purity}</Badge>
      </div>
      <p class="text-xs text-slate-500">{props.note.timing}</p>
      <p class="text-base leading-6 dark:text-slate-300">{props.note.summary}</p>
    </Card>
  );
}

const PRIMITIVE_NOTES: PrimitiveNote[] = [
  {
    name: 'createComputed',
    purity: 'pure',
    timing: 'Runs immediately before render.',
    summary: 'A reactive computation used mainly for synchronously writing into other primitives.'
  },
  {
    name: 'createRenderEffect',
    purity: 'not pure',
    timing: 'Runs during render while DOM is being created or updated.',
    summary: 'Useful when work must stay tightly coupled to DOM creation and update timing.'
  },
  {
    name: 'createEffect',
    purity: 'not pure',
    timing: 'Runs after the render phase.',
    summary: 'The standard side-effect primitive for async work, logging, subscriptions and DOM interactions.'
  },
  {
    name: 'createReaction',
    purity: 'not pure',
    timing: 'Runs after render with explicit tracking control.',
    summary: 'Lets you separate dependency tracking from the callback that should run on the next invalidation.'
  },
  {
    name: 'createMemo',
    purity: 'pure',
    timing: 'Derived value inside the reactive graph.',
    summary: 'Readonly memoized signal for deterministic derived state.'
  },
  {
    name: 'createDeferred',
    purity: 'pure',
    timing: 'Defers notifications until the browser is idle.',
    summary: 'Useful when derived updates may lag behind more urgent UI interactions.'
  },
  {
    name: 'createSelector',
    purity: 'pure',
    timing: 'Conditional signal keyed by equality against the current selected value.',
    summary: 'Notifies subscribers only when their key starts or stops matching the current selection.'
  },
  {
    name: 'catchError',
    purity: 'pure',
    timing: 'Wraps child scopes and reacts when they throw.',
    summary: 'Provides a reactive error-boundary-style primitive for child computation scopes.'
  },
  {
    name: 'devComponent',
    purity: 'pure',
    timing: 'Development-only internal helper.',
    summary: 'Not a public everyday primitive, but it still participates in the same owner/computation model.'
  }
];
