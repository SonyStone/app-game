import { cn } from '@app-game/utils/cn';
import type { JSX } from '@solidjs/web';
import { Dock, type DockDropPolicy, findGuideDropTarget } from 'solid-dock';
import { createSignal, createStore, For, Show } from 'solid-js';
import { DockingGuides, floatingPanelStyle, FloatingWindowFrame } from './behaviors';
import { Slider, Toggle } from './controls';
import { createDemoLayout, DemoButton, DemoDock, type DemoDockTheme, DemoSection } from './DemoDock';

/**
 * Dashboard: every panel is a card with its own title bar instead of tabs.
 * Cards can be dragged to any edge, but never dropped onto each other.
 */
export function DashboardExample(): JSX.Element {
  const layout = createDemoLayout({
    column: [
      { row: [{ group: ['revenue'] }, { group: ['users'] }, { group: ['conversion'] }] },
      { row: [{ group: ['traffic'] }, { column: [{ group: ['goals'] }, { group: ['activity'] }] }], sizes: [2, 1] }
    ],
    sizes: [1, 3]
  });
  const [mode, setMode] = createSignal<DashboardDragMode>('preview');
  const [options, setOptions] = createStore<DashboardOptions>({
    animate: true,
    animationDuration: 200,
    dragLabel: true,
    minPaneSize: 80,
    gap: 10,
    radius: 12
  });
  const update = (change: (draft: DashboardOptions) => void) => setOptions((draft) => void change(draft));

  return (
    <DemoSection
      title="Dashboard"
      description="Panels without tabs: each card has a title bar to drag it by. Drops only split the layout, so cards never end up inside each other. The rule is one acceptDrop callback; every drag behaviour respects it."
      actions={
        <>
          <div class="flex gap-1 rounded-[10px] bg-white p-1 shadow-sm">
            <For each={DRAG_MODES}>
              {(candidate) => (
                <DemoButton active={mode() === candidate.id} onClick={() => setMode(candidate.id)}>
                  {candidate.label}
                </DemoButton>
              )}
            </For>
          </div>
          <DemoButton onClick={layout.reset}>Reset layout</DemoButton>
        </>
      }
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] bg-white p-1.5 text-neutral-800 shadow-sm">
        <Toggle
          label="Animate"
          checked={options.animate}
          onChange={(value) => update((draft) => (draft.animate = value))}
        />
        <Show when={options.animate}>
          <div class="w-52">
            <Slider
              label="Animation length"
              unit="ms"
              min={100}
              max={3000}
              step={100}
              value={options.animationDuration}
              onChange={(value) => update((draft) => (draft.animationDuration = value))}
            />
          </div>
        </Show>
        <Toggle
          label="Label under the pointer"
          checked={options.dragLabel}
          onChange={(value) => update((draft) => (draft.dragLabel = value))}
        />
        <div class="w-44">
          <Slider
            label="Smallest card"
            unit="px"
            min={40}
            max={240}
            step={10}
            value={options.minPaneSize}
            onChange={(value) => update((draft) => (draft.minPaneSize = value))}
          />
        </div>
        <div class="w-36">
          <Slider
            label="Gap"
            unit="px"
            min={0}
            max={24}
            step={1}
            value={options.gap}
            onChange={(value) => update((draft) => (draft.gap = value))}
          />
        </div>
        <div class="w-36">
          <Slider
            label="Radius"
            unit="px"
            min={0}
            max={24}
            step={1}
            value={options.radius}
            onChange={(value) => update((draft) => (draft.radius = value))}
          />
        </div>
      </div>
      <DemoDock
        layout={layout}
        theme={dashboardTheme}
        class="h-[540px]"
        style={{
          '--dash-gap': `${options.gap}px`,
          '--dash-radius': `${options.radius}px`,
          '--dash-outer-radius': `${options.radius + options.gap}px`,
          '--dash-inner-radius': `${Math.max(0, options.radius - 1)}px`
        }}
        acceptDrop={noMerging}
        animate={options.animate}
        animationDuration={options.animationDuration}
        minPaneSize={options.minPaneSize}
        liveMove={mode() === 'live'}
        detachOnDrag={mode() === 'window'}
        resolveDropTarget={mode() === 'guides' ? findGuideDropTarget : undefined}
        hideIndicator={mode() === 'live'}
        hideDragLabel={!options.dragLabel || mode() === 'window'}
        panelStyle={mode() === 'window' ? floatingPanelStyle : undefined}
        overlay={
          <>
            <Show when={mode() === 'guides'}>
              <DockingGuides />
            </Show>
            <Show when={mode() === 'window'}>
              <FloatingWindowFrame />
            </Show>
          </>
        }
      >
        <Dock.Panel id="revenue" title="Revenue">
          <Kpi value="$48.2k" change={12.4} points={[8, 9, 7, 11, 12, 10, 14, 15, 13, 17]} />
        </Dock.Panel>
        <Dock.Panel id="users" title="Active users">
          <Kpi value="2,931" change={4.1} points={[20, 22, 21, 23, 26, 24, 27, 26, 29, 30]} />
        </Dock.Panel>
        <Dock.Panel id="conversion" title="Conversion">
          <Kpi value="3.8%" change={-0.6} points={[5, 4.6, 4.8, 4.2, 4.4, 4.1, 4, 3.9, 4, 3.8]} />
        </Dock.Panel>
        <Dock.Panel id="traffic" title="Traffic by day" minWidth={260}>
          <BarChart values={[42, 58, 51, 66, 72, 38, 30]} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} />
        </Dock.Panel>
        <Dock.Panel id="goals" title="Goals">
          <Goals />
        </Dock.Panel>
        <Dock.Panel id="activity" title="Activity">
          <Activity />
        </Dock.Panel>
      </DemoDock>
    </DemoSection>
  );
}

type DashboardDragMode = 'preview' | 'live' | 'guides' | 'window';

type DashboardOptions = {
  animate: boolean;
  animationDuration: number;
  dragLabel: boolean;
  minPaneSize: number;
  /** Canvas padding and space between cards, in px. */
  gap: number;
  /** Card corner radius, in px. */
  radius: number;
};

const DRAG_MODES: { id: DashboardDragMode; label: string }[] = [
  { id: 'preview', label: 'Drop preview' },
  { id: 'live', label: 'Live move' },
  { id: 'guides', label: 'Docking guides' },
  { id: 'window', label: 'Floating window' }
];

/** Splits only: no merging into a card and no tab strips to insert into. */
const noMerging: DockDropPolicy = ({ target }) => target.type === 'root' || target.zone !== 'center';

/**
 * Cards on a light canvas; the single panel's tab is the card's title bar.
 * Spacing and rounding come from CSS variables set on the root, so changing them
 * restyles the dock without re-rendering it: canvas padding = gap between cards
 * (`--dash-gap`), card radius `--dash-radius`, canvas radius radius + gap, and the
 * panel element rounds the card's bottom corners (`--dash-inner-radius`).
 */
const dashboardTheme: DemoDockTheme = {
  root: 'rounded-[var(--dash-outer-radius)] bg-neutral-200/80 p-[var(--dash-gap)] text-neutral-800 [--dock-gap:var(--dash-gap)]',
  group: (group, content) => (
    <section
      {...group.props}
      class={cn(
        'flex flex-col overflow-hidden rounded-[var(--dash-radius)] border border-neutral-200 bg-white shadow-sm',
        group.dragging() && 'opacity-50'
      )}
    >
      <For each={group.panels().slice(0, 1)}>
        {(panelId) => (
          <Dock.Tab id={panelId}>
            {(tab) => (
              <div
                {...tab.props}
                class={cn(
                  'flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-neutral-100 px-4 text-[13px] font-medium select-none active:cursor-grabbing',
                  tab.dragging() && 'opacity-40'
                )}
              >
                <svg viewBox="0 0 10 16" class="h-3 w-2 text-neutral-400" fill="currentColor" aria-hidden="true">
                  <circle cx="2.5" cy="3" r="1.25" />
                  <circle cx="7.5" cy="3" r="1.25" />
                  <circle cx="2.5" cy="8" r="1.25" />
                  <circle cx="7.5" cy="8" r="1.25" />
                  <circle cx="2.5" cy="13" r="1.25" />
                  <circle cx="7.5" cy="13" r="1.25" />
                </svg>
                {tab.title()}
              </div>
            )}
          </Dock.Tab>
        )}
      </For>
      {content}
    </section>
  ),
  sash: (sash) => (
    <div
      {...sash.props}
      class={cn(
        'group flex items-center justify-center outline-none',
        sash.direction() === 'row' ? 'cursor-col-resize' : 'cursor-row-resize'
      )}
    >
      <span
        class={cn(
          'rounded-full bg-sky-500 opacity-0 transition-opacity group-hover:opacity-100',
          sash.dragging() && 'opacity-100',
          sash.direction() === 'row' ? 'h-10 w-1' : 'h-1 w-10'
        )}
      />
    </div>
  ),
  panel: 'rounded-b-[var(--dash-inner-radius)] bg-white',
  // Ends above the bottom corners and keeps cards from scrolling sideways.
  scroll:
    'absolute inset-x-0 top-0 bottom-[var(--dash-inner-radius)] overflow-x-hidden overflow-y-auto [scrollbar-width:thin]',
  indicator: 'rounded-[var(--dash-radius)] bg-sky-500/15 ring-2 ring-sky-500 ring-inset',
  dragLabel: 'rounded-[8px] border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium shadow-lg'
};

function Kpi(props: { value: string; change: number; points: number[] }): JSX.Element {
  const path = () => {
    const max = Math.max(...props.points);
    const min = Math.min(...props.points);
    return props.points
      .map(
        (point, index) => `${(index / (props.points.length - 1)) * 100},${30 - ((point - min) / (max - min || 1)) * 26}`
      )
      .join(' ');
  };

  return (
    <div class="flex h-full min-w-0 items-center justify-between gap-3 px-4">
      <div class="flex min-w-0 flex-col whitespace-nowrap">
        <span class="truncate text-2xl font-semibold tabular-nums">{props.value}</span>
        <span class={cn('truncate text-xs font-medium', props.change >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
          {props.change >= 0 ? '▲' : '▼'} {Math.abs(props.change)}% vs last week
        </span>
      </div>
      <svg viewBox="0 0 100 32" class="h-10 w-28 min-w-0 shrink-[4]" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points={path()}
          fill="none"
          stroke={props.change >= 0 ? '#10b981' : '#f43f5e'}
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function BarChart(props: { values: number[]; labels: string[] }): JSX.Element {
  const max = () => Math.max(...props.values);

  return (
    <div class="flex h-full items-end gap-3 p-4">
      <For each={props.values}>
        {(value, index) => (
          <div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span class="text-[11px] text-neutral-500 tabular-nums">{value}k</span>
            <div class="w-full rounded-t-[6px] bg-sky-500/80" style={{ height: `${(value / max()) * 75}%` }} />
            <span class="text-[11px] text-neutral-500">{props.labels[index()]}</span>
          </div>
        )}
      </For>
    </div>
  );
}

function Goals(): JSX.Element {
  const goals = [
    { label: 'Signups', value: 72 },
    { label: 'Retention', value: 54 },
    { label: 'NPS', value: 88 }
  ];

  return (
    <div class="flex flex-col gap-3 p-4">
      <For each={goals}>
        {(goal) => (
          <div class="flex flex-col gap-1">
            <span class="flex justify-between text-[12px]">
              {goal.label}
              <span class="text-neutral-500 tabular-nums">{goal.value}%</span>
            </span>
            <div class="h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div class="h-full rounded-full bg-violet-500" style={{ width: `${goal.value}%` }} />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function Activity(): JSX.Element {
  const items = [
    ['Anna', 'upgraded to Pro', '2m'],
    ['Leo', 'invited 3 teammates', '14m'],
    ['Mia', 'exported a report', '1h'],
    ['Sam', 'cancelled a trial', '3h']
  ];

  return (
    <ul class="flex flex-col p-2">
      <For each={items}>
        {([name, action, time]) => (
          <li class="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px] hover:bg-neutral-50">
            <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-[10px] font-semibold">
              {name[0]}
            </span>
            <span class="min-w-0 flex-1 truncate">
              <b class="font-medium">{name}</b> {action}
            </span>
            <Show when={time}>
              <span class="text-neutral-400">{time}</span>
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}
