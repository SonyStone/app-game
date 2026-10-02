import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { Dock, type DockDropPolicy } from 'solid-dock';
import { createSignal, For } from 'solid-js';
import { createDemoLayout, DemoButton, DemoDock, DemoSection } from './DemoDock';
import { FilesPanel, NotesPanel } from './demo-panels';
import { minimalTheme } from './themes';

/**
 * Panels with rules: size limits, a locked toolbar, a panel that never shares its
 * group, and a console that only docks to the bottom. Each panel lists its rules
 * and shows its live size, so you can try to break them.
 */
export function ConstraintsExample(): JSX.Element {
  const layout = createDemoLayout({
    column: [
      { group: ['toolbar'] },
      {
        row: [
          { group: ['explorer'] },
          { column: [{ group: ['editor'] }, { group: ['console'] }], sizes: [3, 1] },
          { group: ['inspector'] }
        ],
        sizes: [1, 3, 1.2]
      }
    ],
    sizes: [1, 12]
  });

  return (
    <DemoSection
      title="Constraints"
      description="Rules are props on the panels plus one acceptDrop callback. Sashes stop at the limits, the browser respects them when the page resizes, and drops that break a rule are never offered."
      actions={
        <>
          <DemoButton onClick={layout.reopen}>Reopen closed ({layout.closed().length})</DemoButton>
          <DemoButton onClick={layout.reset}>Reset layout</DemoButton>
        </>
      }
    >
      <DemoDock layout={layout} theme={minimalTheme} class="h-[560px]" acceptDrop={consoleStaysAtTheBottom} animate>
        <Dock.Panel
          id="toolbar"
          title={<Locked>Toolbar</Locked>}
          minHeight={80}
          maxHeight={80}
          draggable={false}
          standalone
        >
          <Toolbar />
        </Dock.Panel>
        <Dock.Panel id="explorer" title="Explorer" minWidth={180} maxWidth={320}>
          <Rules items={['180–320 px wide']}>
            <FilesPanel />
          </Rules>
        </Dock.Panel>
        <Dock.Panel id="editor" title="Editor" minWidth={320} minHeight={160}>
          <Rules items={['at least 320 × 160 px', 'cannot be closed']}>
            <NotesPanel />
          </Rules>
        </Dock.Panel>
        <Dock.Panel id="console" title="Console" minHeight={90} maxHeight={260} closable>
          <Rules items={['90–260 px tall', 'docks only to bottom edges']} />
        </Dock.Panel>
        <Dock.Panel id="inspector" title="Inspector" minWidth={220} maxWidth={380} standalone closable>
          <Rules items={['220–380 px wide', 'standalone: always alone in its group']} />
        </Dock.Panel>
      </DemoDock>
    </DemoSection>
  );
}

/** The console may only land on a bottom edge, of a group or of the whole dock. */
const consoleStaysAtTheBottom: DockDropPolicy = ({ subject, target }) => {
  if (subject.type !== 'panel' || subject.panelId !== 'console') {
    return true;
  }

  return target.type === 'root' ? target.edge === 'bottom' : target.zone === 'bottom';
};

function Locked(props: { children: JSX.Element }): JSX.Element {
  return (
    <span class="flex items-center gap-1.5">
      <svg viewBox="0 0 16 16" class="h-3 w-3 opacity-60" fill="currentColor" aria-label="Locked">
        <path d="M5 7V5a3 3 0 0 1 6 0v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
      </svg>
      {props.children}
    </span>
  );
}

function Toolbar(): JSX.Element {
  return (
    <div class="flex h-full items-center gap-2 px-3 text-[12px]">
      <For each={['New', 'Open', 'Save', 'Run']}>
        {(label) => <span class="rounded-[6px] border border-neutral-300 px-2 py-0.5">{label}</span>}
      </For>
      <span class="ml-auto opacity-60">locked · exactly 80 px with its tab · nothing docks into it</span>
    </div>
  );
}

/** Lists a panel's rules above its content and shows the panel's live size. */
function Rules(props: { items: string[]; children?: JSX.Element }): JSX.Element {
  const [element, setElement] = createSignal<HTMLElement>();
  const size = createElementSize(element);

  return (
    <div ref={setElement} class="flex h-full flex-col">
      <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-neutral-200 px-3 py-2 text-[11px]">
        <For each={props.items}>
          {(rule) => <span class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{rule}</span>}
        </For>
        <span class="ml-auto font-mono tabular-nums opacity-60">
          {Math.round(size.width ?? 0)} × {Math.round(size.height ?? 0)}
        </span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">{props.children}</div>
    </div>
  );
}
