import type { JSX } from '@solidjs/web';
import { Dock, findGuideDropTarget } from 'solid-dock';
import { createMemo, createSignal, createStore, For, Show } from 'solid-js';
import { DockingGuides, floatingPanelStyle, FloatingWindowFrame } from './behaviors';
import { Choice, SettingList, Slider, Toggle } from './controls';
import {
  CounterPanel,
  FileBadge,
  FilesPanel,
  InstanceProofPanel,
  LayoutJsonPanel,
  NotesPanel,
  PanelButton,
  SketchPanel
} from './demo-panels';
import { createDemoLayout, DemoDock } from './DemoDock';
import { createDesigns, type DemoDesign } from './themes';

/**
 * One dock whose settings live in its own panels: switch the design or the drag
 * behaviour from inside the dock and every panel, including the settings you
 * are clicking, keeps its state. Designs only re-render windows and sashes;
 * behaviours are props on the same headless parts.
 */
export function Playground(): JSX.Element {
  const layout = createDemoLayout({
    row: [
      { column: [{ group: ['design'] }, { group: ['behaviour', 'options'] }], sizes: [1, 1] },
      {
        column: [
          { row: [{ group: ['files'] }, { group: ['notes', 'counter'] }], sizes: [1, 2] },
          { group: ['iframe', 'sketch', 'layout', 'code'] }
        ],
        sizes: [3, 2]
      }
    ],
    sizes: [1, 3]
  });
  const designs = createDesigns(layout);
  const [settings, setSettings] = createStore<PlaygroundSettings>({
    design: designs[0].id,
    drag: 'preview',
    animate: true,
    animationDuration: 200,
    dragLabel: true,
    minPaneSize: 48
  });
  const [dirty, setDirty] = createSignal(false);
  const design = createMemo(() => designs.find((candidate) => candidate.id === settings.design) ?? designs[0]);
  const title = (name: string, file: string) => <PanelTitle name={name} file={file} fileTitles={design().fileTitles} />;
  const update = (change: (draft: PlaygroundSettings) => void) => setSettings((draft) => void change(draft));

  return (
    <DemoDock
      layout={layout}
      theme={design().theme}
      class="h-[760px]"
      liveMove={settings.drag === 'live'}
      detachOnDrag={settings.drag === 'window'}
      resolveDropTarget={settings.drag === 'guides' ? findGuideDropTarget : undefined}
      animate={settings.animate}
      animationDuration={settings.animationDuration}
      minPaneSize={settings.minPaneSize}
      hideIndicator={settings.drag === 'live'}
      hideDragLabel={!settings.dragLabel || settings.drag === 'window'}
      panelStyle={settings.drag === 'window' ? floatingPanelStyle : undefined}
      overlay={
        <>
          <Show when={settings.drag === 'guides'}>
            <DockingGuides />
          </Show>
          <Show when={settings.drag === 'window'}>
            <FloatingWindowFrame />
          </Show>
        </>
      }
    >
      <Dock.Panel id="design" title={title('Design', 'design.json')} minWidth={220}>
        <DesignPanel
          designs={designs}
          selected={settings.design}
          onSelect={(id) => update((draft) => (draft.design = id))}
        />
      </Dock.Panel>
      <Dock.Panel id="behaviour" title={title('Drag', 'drag.json')} minWidth={220}>
        <DragPanel selected={settings.drag} onSelect={(mode) => update((draft) => (draft.drag = mode))} />
      </Dock.Panel>
      <Dock.Panel id="options" title={title('Options', 'options.json')} minWidth={220}>
        <OptionsPanel settings={settings} update={update} layout={layout} />
      </Dock.Panel>
      <Dock.Panel id="code" title={title('Code', 'Dock.tsx')} closable>
        <pre class="p-3 font-mono text-[11px] leading-relaxed opacity-80">{usageCode(settings, design().label)}</pre>
      </Dock.Panel>
      <Dock.Panel id="files" title={title('Files', 'files.ts')}>
        <FilesPanel />
      </Dock.Panel>
      <Dock.Panel
        id="notes"
        title={
          <>
            {title('Notes', 'notes.md')}
            <Show when={dirty()}>
              <span class="text-[10px]">●</span>
            </Show>
          </>
        }
        closable
      >
        <NotesPanel onEdit={() => setDirty(true)} />
      </Dock.Panel>
      <Dock.Panel id="counter" title={title('Counter', 'Counter.tsx')} closable>
        <CounterPanel />
      </Dock.Panel>
      <Dock.Panel id="iframe" title={title('iframe', 'proof.html')} closable>
        <InstanceProofPanel />
      </Dock.Panel>
      <Dock.Panel id="sketch" title={title('Sketch', 'Sketch.tsx')} closable>
        <SketchPanel />
      </Dock.Panel>
      <Dock.Panel id="layout" title={title('Layout', 'layout.json')} closable>
        <LayoutJsonPanel state={layout.state} />
      </Dock.Panel>
    </DemoDock>
  );
}

type DragMode = 'preview' | 'live' | 'guides' | 'window';

type PlaygroundSettings = {
  design: string;
  drag: DragMode;
  animate: boolean;
  animationDuration: number;
  dragLabel: boolean;
  minPaneSize: number;
};

const DRAG_MODES: { id: DragMode; label: string; description: string }[] = [
  {
    id: 'preview',
    label: 'Drop preview',
    description: 'A frame shows where the tab lands; the layout changes on release.'
  },
  {
    id: 'live',
    label: 'Live move',
    description: 'The layout rearranges while you drag: the tab is always where it will land.'
  },
  {
    id: 'guides',
    label: 'Docking guides',
    description: 'Visual Studio compass: drops land only on a guide or a tab strip.'
  },
  {
    id: 'window',
    label: 'Floating window',
    description: 'The panel leaves the layout and floats with its title until you dock it.'
  }
];

/** Design picker. Lives inside the dock it restyles. */
function DesignPanel(props: { designs: DemoDesign[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <SettingList hint="Render functions for groups, tabs and sashes. This panel survives every switch.">
      <For each={props.designs}>
        {(design) => (
          <Choice
            label={design.label}
            description={design.description}
            selected={props.selected === design.id}
            onSelect={() => props.onSelect(design.id)}
          />
        )}
      </For>
    </SettingList>
  );
}

function DragPanel(props: { selected: DragMode; onSelect: (mode: DragMode) => void }) {
  return (
    <SettingList hint="Props and overlays on the same parts.">
      <For each={DRAG_MODES}>
        {(mode) => (
          <Choice
            label={mode.label}
            description={mode.description}
            selected={props.selected === mode.id}
            onSelect={() => props.onSelect(mode.id)}
          />
        )}
      </For>
    </SettingList>
  );
}

function OptionsPanel(props: {
  settings: PlaygroundSettings;
  update: (change: (draft: PlaygroundSettings) => void) => void;
  layout: ReturnType<typeof createDemoLayout>;
}) {
  return (
    <SettingList>
      <Toggle
        label="Animate layout changes"
        checked={props.settings.animate}
        onChange={(value) => props.update((draft) => (draft.animate = value))}
      />
      <Show when={props.settings.animate}>
        <Slider
          label="Animation length"
          unit="ms"
          min={100}
          max={3000}
          step={100}
          value={props.settings.animationDuration}
          onChange={(value) => props.update((draft) => (draft.animationDuration = value))}
        />
      </Show>
      <Toggle
        label="Label under the pointer"
        checked={props.settings.dragLabel}
        onChange={(value) => props.update((draft) => (draft.dragLabel = value))}
      />
      <Slider
        label="Smallest pane"
        unit="px"
        min={24}
        max={240}
        step={8}
        value={props.settings.minPaneSize}
        onChange={(value) => props.update((draft) => (draft.minPaneSize = value))}
      />
      <div class="flex flex-wrap gap-2 px-2.5 pt-2">
        <PanelButton onClick={props.layout.reopen}>Reopen closed ({props.layout.closed().length})</PanelButton>
        <PanelButton onClick={props.layout.reset}>Reset layout</PanelButton>
      </div>
    </SettingList>
  );
}

/**
 * Tab title that follows the design: a plain name, or a file name with a type
 * badge in editor-like designs. Titles are JSX, so they update in place.
 */
function PanelTitle(props: { name: string; file: string; fileTitles: boolean }): JSX.Element {
  return (
    <Show when={props.fileTitles} fallback={<span>{props.name}</span>}>
      <FileBadge name={props.file} />
      <span>{props.file}</span>
    </Show>
  );
}

/** The `<Dock.Root>` markup matching the current settings. */
function usageCode(settings: PlaygroundSettings, designLabel: string): string {
  const rootProps = [
    'state={dock}',
    'setState={setDock}',
    settings.drag === 'live' && 'liveMove',
    settings.drag === 'window' && 'detachOnDrag',
    settings.drag === 'guides' && 'resolveDropTarget={findGuideDropTarget}',
    settings.animate && `transition={flipTransition({ duration: ${settings.animationDuration} })}`,
    `minPaneSize={${settings.minPaneSize}}`,
    'panels={<>…<Dock.Panel id="design" minWidth={220}><DesignPanel /></Dock.Panel>…</>}'
  ].filter(Boolean);
  const children = [
    `<Dock.Windows>{(group) => <section {...group.props}>…</section>}</Dock.Windows> {/* ${designLabel} */}`,
    settings.drag === 'window'
      ? '<Dock.Panels>{(panel) => <div style={floatingPanelStyle(panel)} />}</Dock.Panels>'
      : '<Dock.Panels />',
    '<Dock.Sashes>{(sash) => <div {...sash.props} />}</Dock.Sashes>',
    settings.drag !== 'live' && '<Dock.DropIndicator class="…" />',
    settings.drag === 'guides' && '<DockingGuides />',
    settings.drag === 'window' && '<FloatingWindowFrame />',
    settings.dragLabel && settings.drag !== 'window' && '<Dock.DragPreview>{(session) => …}</Dock.DragPreview>'
  ].filter(Boolean);

  return `<Dock.Root\n${rootProps.map((prop) => `  ${prop}`).join('\n')}\n>\n${children.map((child) => `  ${child}`).join('\n')}\n</Dock.Root>`;
}
