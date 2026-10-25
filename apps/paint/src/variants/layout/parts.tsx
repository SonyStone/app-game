import type { Brush } from '@app-game/paint-core/brush';
import type { LayerAction } from '@app-game/paint-core/document';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { maxBrushSize, type PaintTool } from '../../features/brush';
import type { BrushPreset } from '../../features/brush-library';
import { BrushSizeGrid } from '../../features/brush-size';
import { ColorPanel } from '../../features/color';
import { ColorWheel, type ColorWheelSettings } from '../../features/color-wheel';
import { CoolorusWheel } from '../../features/coolorus-wheel';
import type { createCoolorusSettings } from '../../features/coolorus-wheel/createCoolorusSettings';
import { HueTriangle } from '../../features/hue-triangle';
import { LayersPanel, type DocumentState } from '../../features/layers';
import studio from '../../features/studio/PaintStudio.module.css';
import { ToolBar } from '../../features/studio/ToolBar';
import { ColorPanel as DesktopColorPanel } from '../desktop/ColorPanel';
import desktop from '../desktop/DesktopStudio.module.css';
import { LayersPanel as DesktopLayersPanel } from '../desktop/LayersPanel';
import { BrushLibrary } from '../procreate/BrushLibrary';
import { ColorsPopover, type ColorMode } from '../procreate/ColorsPopover';
import { LayersPopover } from '../procreate/LayersPopover';
import popover from '../procreate/Popover.module.css';
import procreate from '../procreate/ProcreateStudio.module.css';
import cluster from '../puck/cluster.module.css';
import { ColorCard } from '../puck/ColorCard';
import { LayersCard } from '../puck/LayersCard';
import { sizes } from '../puck/layout';
import { ColorDisc } from '../zen/ColorDisc';
import zen from '../zen/ZenStudio.module.css';
import styles from './parts.module.css';

/**
 * What a page part reads and changes: the brush, the drawing's layers, the presets, the tool and a few windows. The
 * layout variant gives the drawing session's (`sessionContext`); the component canvas's constructor gives state of its
 * own, so that a part shows there as it will on the page.
 */
export type PartContext = {
  brush: () => Brush;
  updateBrush: (patch: Partial<Brush>) => void;
  swapColors: () => void;
  recentColors: () => readonly string[];
  rememberColor: (color: string) => void;
  /** The drawing's layers and history, as the engine reports them. */
  document: () => DocumentState;
  /** Commands that wait for the engine can run. */
  ready: () => boolean;
  layer: (action: LayerAction) => void;
  blending: (linear: boolean) => void;
  presets: () => readonly BrushPreset[];
  /** The preset the active tool paints with. */
  preset: () => string;
  /** Recently used presets, newest first. */
  recentPresets: () => readonly string[];
  usePreset: (id: string) => void;
  tool: () => PaintTool;
  chooseTool: (tool: PaintTool) => void;
  mirrored: () => boolean;
  toggleMirror: () => void;
  /** The mixing palette window. */
  palette: { open: () => boolean; toggle: () => void };
  /** Shared picker preferences; the session persists them, the constructor owns its own choices. */
  coolorus: ReturnType<typeof createCoolorusSettings>;
  /** The color wheel's and the Color panel's picker settings, shared with Studio. */
  wheel: { settings: () => ColorWheelSettings; update: (patch: Partial<ColorWheelSettings>) => void };
};

/** A part a page can hold: its name in the constructor and how it draws over a context. */
export type LayoutPart = { name: string; render: (context: PartContext) => JSX.Element };

/**
 * The parts a page can hold, by the id a layout file names them with; each in its variant's frame and tokens. Keep
 * ids stable: saved pages name parts by them, and a page drops a part whose id is gone.
 */
export const layoutParts: Record<string, LayoutPart> = {
  'studio-color': { name: 'Studio: Color panel', render: (context) => <StudioColor context={context} /> },
  'studio-layers': {
    name: 'Studio: Layers panel',
    render: (context) => (
      <div class={styles.studioPanel}>
        <LayersPanel
          state={context.document()}
          ready={context.ready()}
          onAction={context.layer}
          onLinearBlending={context.blending}
        />
      </div>
    )
  },
  'studio-tools': {
    name: 'Studio: tool rail',
    render: (context) => (
      <div class={[studio.studio, styles.studioRail]}>
        <ToolBar
          tool={context.tool()}
          mirrored={context.mirrored()}
          symmetry={false}
          panel={undefined}
          transforming={false}
          onTransform={() => {}}
          onChooseTool={context.chooseTool}
          onToggleMirror={context.toggleMirror}
          onTogglePanel={() => {}}
        />
      </div>
    )
  },
  'brush-size': {
    name: 'Studio: brush size grid',
    render: (context) => (
      <div class={styles.studioBar}>
        <BrushSizeGrid
          size={context.brush().size}
          max={maxBrushSize(context.brush())}
          onPreview={(size) => context.updateBrush({ size })}
          onPick={(size) => context.updateBrush({ size })}
        />
      </div>
    )
  },
  triangle: {
    name: 'Hue triangle',
    render: (context) => (
      <div class={styles.studioPanel}>
        <section>
          <HueTriangle
            color={context.brush().color}
            onChange={(color) => context.updateBrush({ color })}
            onSettle={() => {}}
          />
        </section>
      </div>
    )
  },
  'oklch-wheel': {
    name: 'OKLCH wheel',
    render: (context) => (
      <div class={styles.studioPanel}>
        <section>
          <ColorWheel
            color={context.brush().color}
            onChange={(color) => context.updateBrush({ color })}
            onSettle={() => {}}
            settings={context.wheel.settings()}
            onSettings={context.wheel.update}
          />
        </section>
      </div>
    )
  },
  coolorus: { name: 'Coolorus wheel', render: (context) => <Coolorus context={context} /> },
  'procreate-colors': { name: 'Procreate: Colors', render: (context) => <ProcreateColors context={context} /> },
  'procreate-brushes': {
    name: 'Procreate: Brush Library',
    render: (context) => (
      <ProcreateCard width={470}>
        <BrushLibrary
          title="Brush Library"
          presets={context.presets()}
          recent={context.recentPresets()}
          preset={context.preset()}
          disabled={!context.ready()}
          onChoose={context.usePreset}
        />
      </ProcreateCard>
    )
  },
  'procreate-layers': {
    name: 'Procreate: Layers',
    render: (context) => (
      <ProcreateCard width={340}>
        <LayersPopover state={context.document()} ready={context.ready()} onAction={context.layer} />
      </ProcreateCard>
    )
  },
  'puck-color': {
    name: 'Puck: color card',
    render: (context) => (
      <PuckCard size={sizes.color}>
        {(box) => (
          <ColorCard
            recentColors={{ colors: context.recentColors, remember: context.rememberColor }}
            box={box}
            color={context.brush().color}
            background={context.brush().backgroundColor ?? '#ffffff'}
            onColor={(color) => context.updateBrush({ color })}
            onSwap={context.swapColors}
            mixing={context.palette.open()}
            onMixing={context.palette.toggle}
            done={() => {}}
          />
        )}
      </PuckCard>
    )
  },
  'puck-layers': {
    name: 'Puck: layers card',
    render: (context) => (
      <PuckCard size={sizes.layers}>
        {(box) => (
          <LayersCard
            box={box}
            layers={context.document().layers}
            activeId={context.document().activeId}
            ready={context.ready()}
            onAction={context.layer}
            done={() => {}}
            onEscape={() => {}}
          />
        )}
      </PuckCard>
    )
  },
  'desktop-color': { name: 'Desktop: Color panel', render: (context) => <DesktopColor context={context} /> },
  'desktop-layers': {
    name: 'Desktop: Layers panel',
    render: (context) => (
      <div class={[desktop.editor, styles.desktopPanel]}>
        <DesktopLayersPanel
          layers={context.document().layers}
          activeId={context.document().activeId}
          ready={context.ready()}
          onAction={context.layer}
        />
      </div>
    )
  },
  'zen-disc': {
    name: 'Zen: color disc',
    render: (context) => (
      <div class={[zen.editor, styles.zenCard]}>
        <ColorDisc
          color={context.brush().color}
          onInput={(color) => context.updateBrush({ color })}
          onCommit={context.rememberColor}
        />
      </div>
    )
  }
};

/** Studio's Color panel with the picker Studio offers: the square, the triangle or the wheel, as Studio keeps it. */
function StudioColor(props: { context: PartContext }) {
  const context = props.context;

  return (
    <div class={styles.studioPanel}>
      <ColorPanel
        recentColors={{ colors: context.recentColors, remember: context.rememberColor }}
        brush={context.brush()}
        onChange={context.updateBrush}
        alternatives={{
          chosen: context.wheel.settings().picker,
          onChoose: (picker) =>
            context.wheel.update({ picker: picker === 'wheel' || picker === 'triangle' ? picker : 'square' }),
          options: [
            {
              id: 'triangle',
              label: 'Triangle',
              render: (control) => (
                <HueTriangle color={control.color} onChange={control.onChange} onSettle={control.onSettle} />
              )
            },
            {
              id: 'wheel',
              label: 'Wheel',
              render: (control) => (
                <ColorWheel
                  color={control.color}
                  onChange={control.onChange}
                  onSettle={control.onSettle}
                  settings={context.wheel.settings()}
                  onSettings={context.wheel.update}
                />
              )
            }
          ]
        }}
      />
    </div>
  );
}

/** The Coolorus wheel, with settings of the page's own. */
function Coolorus(props: { context: PartContext }) {
  return (
    <div class={styles.studioPanel}>
      <section>
        <CoolorusWheel
          color={props.context.brush().color}
          onChange={(color) => props.context.updateBrush({ color })}
          onSettle={() => {}}
          settings={props.context.coolorus.settings()}
          onSettings={props.context.coolorus.update}
        />
      </section>
    </div>
  );
}

/** The Procreate variant's Colors popover on its own card. */
function ProcreateColors(props: { context: PartContext }) {
  const context = props.context;
  const [mode, setMode] = createSignal<ColorMode>('disc');

  return (
    <ProcreateCard width={340}>
      <ColorsPopover
        color={context.brush().color}
        secondary={context.brush().backgroundColor ?? '#ffffff'}
        recent={context.recentColors()}
        mode={mode()}
        onMode={setMode}
        onInput={(color) => context.updateBrush({ color })}
        onCommit={context.rememberColor}
        onSwap={context.swapColors}
        mixing={context.palette.open()}
        onMixing={context.palette.toggle}
      />
    </ProcreateCard>
  );
}

/** The Desktop variant's Color panel, editing the foreground or the background color. */
function DesktopColor(props: { context: PartContext }) {
  const [target, setTarget] = createSignal<'color' | 'backgroundColor'>('color');

  return (
    <div class={[desktop.editor, styles.desktopPanel]}>
      <DesktopColorPanel
        recentColors={{ colors: props.context.recentColors, remember: props.context.rememberColor }}
        foreground={props.context.brush().color}
        background={props.context.brush().backgroundColor ?? '#ffffff'}
        target={target()}
        onTarget={setTarget}
        onChange={props.context.updateBrush}
      />
    </div>
  );
}

/** A Procreate popover's card standing free, with the variant's tokens. */
function ProcreateCard(props: { width: number; children: JSX.Element }) {
  return (
    <div class={procreate.editor}>
      {/* Inline, as the variant's stylesheet may load later and keep the card absolutely placed. */}
      <section class={popover.popover} style={{ position: 'relative', animation: 'none', width: `${props.width}px` }}>
        <div class={popover.body}>{props.children}</div>
      </section>
    </div>
  );
}

/**
 * A Puck variant card standing free: the cluster's zero-size root at the card's corner, the card at its size. The
 * card's box starts at the root.
 */
function PuckCard(props: {
  size: { width: number; height: number };
  children: (box: { x: number; y: number; width: number; height: number }) => JSX.Element;
}) {
  return (
    <div style={{ position: 'relative', width: `${props.size.width}px`, height: `${props.size.height}px` }}>
      <div class={cluster.root} style={{ left: '0', top: '0' }}>
        {props.children({ x: 0, y: 0, ...props.size })}
      </div>
    </div>
  );
}
