import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { ConstraintsExample } from './ConstraintsExample';
import { DashboardExample } from './DashboardExample';
import { Playground } from './Playground';

/** Showcase of `solid-dock`: a playground configured from inside itself, a dashboard and constraints. */
export default function DockingPage(): JSX.Element {
  return (
    <main class="h-full overflow-y-auto bg-neutral-100 text-neutral-900">
      <div class="mx-auto flex max-w-[1400px] flex-col gap-10 px-6 py-10">
        <header class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <span class="text-xs font-semibold tracking-widest text-sky-600 uppercase">solid-dock</span>
            <h1 class="text-3xl font-semibold">Headless docking for Solid</h1>
            <p class="max-w-3xl text-neutral-600">
              The package owns the layout model, drag and drop, drop zones, resizing and rules; markup and styles are
              yours. The settings below are panels of the dock they configure: switch the design or the drag behaviour
              from inside it, and every panel keeps its state.
            </p>
          </div>

          <ul class="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <For each={HINTS}>
              {(hint) => (
                <li class="rounded-[12px] border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
                  <span class="block font-medium">{hint.title}</span>
                  <span class="text-neutral-600">{hint.text}</span>
                </li>
              )}
            </For>
          </ul>
        </header>

        <Playground />
        <DashboardExample />
        <ConstraintsExample />
      </div>
    </main>
  );
}

const HINTS = [
  { title: 'Drag a tab', text: 'onto another tab strip, a group edge, or the outer edge of the dock.' },
  { title: 'Drag a group', text: 'with the grip on the right of its header.' },
  { title: 'Resize', text: 'with the sashes; arrow keys work when a sash has focus.' },
  { title: 'Nothing remounts', text: 'type, draw or count, then switch designs or move tabs: it all stays.' }
];
