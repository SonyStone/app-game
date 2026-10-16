import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { defaultColorSample, type ColorSample } from '@app-game/paint-core/colorSample';
import type { SelectionMode } from '@app-game/paint-core/selectionMask';
import { defaultPaintSymmetry, type PaintSymmetry } from '@app-game/paint-core/symmetry';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { BrushAdvancedControls, BrushDailyControls, MixerActions } from '../../features/brush';
import { ColorPickerSettings } from '../../features/color';
import { FillPanel, type FillSettings } from '../../features/fill';
import { FreshTabControls } from '../../features/fresh-tab';
import { GradientPanel, type GradientSettings } from '../../features/gradient';
import { HistorySourceControl } from '../../features/layers';
import { LocalUndoPanel, type LocalUndoSettings } from '../../features/local-undo';
import { createMixingPalette, MixingPalette } from '../../features/mixing-palette';
import { defaultPalmRejection, PalmRejectionControls, type PalmRejectionSettings } from '../../features/palm-rejection';
import { PressureCalibrationControls } from '../../features/pressure-calibration';
import { QuickShapeSettings, type QuickShapePreferences } from '../../features/quickshape';
import { SelectionActions, type SelectionTool, type WandSettings } from '../../features/selection';
import { SymmetryPanel } from '../../features/symmetry';
import { TransformActions, type TransformSettings } from '../../features/transform';
import { ViewOptionsControls, type ViewOptions } from '../../features/view-options';
import styles from '../ComponentCanvas.module.css';
import { fourLayers, SeededLayers } from '../seededLayers';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Feature panels: what Paint's features show in Studio's side panel and in the drawing session's windows, and the
 * floating bars of the transform and the selection, each on settings of its own. They change only their specimen.
 */
export function FeaturePanels() {
  return (
    <CanvasGroup
      id="feature-panels"
      title="Feature panels"
      omitted={
        <>
          The mixing palette keeps its paint in this address's storage, as Paint does. Not here: the dialogs (ABR
          viewer, developer settings) and the notices, which cover the page; the canvas overlays (transform box, guides,
          brush cursor), which need a drawing under them.
        </>
      }
    >
      <CanvasRow title="Tools" note="the side panel's content for each tool">
        <Specimen id="feature-panels/tools/brush" label="Brush: everyday and advanced">
          <BrushControls />
        </Specimen>
        <Specimen id="feature-panels/tools/fill" label="Fill">
          <FillSpecimen />
        </Specimen>
        <Specimen id="feature-panels/tools/gradient" label="Gradient">
          <GradientSpecimen />
        </Specimen>
        <Specimen id="feature-panels/tools/symmetry" label="Symmetry">
          <SymmetrySpecimen />
        </Specimen>
        <Specimen id="feature-panels/tools/mixer" label="Mixer brush and eyedropper">
          <MixerSpecimen />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Settings" note="the Drawing menu's and the Pen window's sections">
        <Specimen id="feature-panels/settings/quickshape" label="QuickShape">
          <QuickShapeSpecimen />
        </Specimen>
        <Specimen id="feature-panels/settings/pen" label="Palm rejection and new tab">
          <PenSpecimen />
        </Specimen>
        <Specimen id="feature-panels/settings/view" label="View options and pressure">
          <ViewSpecimen />
        </Specimen>
        <Specimen id="feature-panels/settings/history" label="Local undo and history source">
          <HistorySpecimen />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Windows and bars">
        <Specimen id="feature-panels/windows/mixing-palette" label="Mixing palette">
          <PaletteSpecimen />
        </Specimen>
        <Specimen id="feature-panels/bars/transform" label="Transform bar">
          <TransformSpecimen />
        </Specimen>
        <Specimen id="feature-panels/bars/selection" label="Selection bar">
          <SelectionSpecimen />
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Studio's side panel frame around sections of a feature. */
function SidePanel(props: { children: JSX.Element }) {
  return <div class={styles.studioPanel}>{props.children}</div>;
}

function BrushControls() {
  const [brush, setBrush] = createSignal<Brush>(defaultBrush());
  const change = (patch: Partial<Brush>) => setBrush((current) => ({ ...current, ...patch }));

  return (
    <SidePanel>
      <BrushDailyControls brush={brush()} onChange={change} />
      <section>
        <BrushAdvancedControls brush={brush()} onChange={change} />
      </section>
    </SidePanel>
  );
}

function FillSpecimen() {
  const [settings, setSettings] = createSignal<FillSettings>({
    tolerance: 32,
    expand: 1,
    gap: 0,
    antialias: true,
    opacity: 1,
    source: 'all'
  });

  return (
    <SidePanel>
      <section>
        <FillPanel settings={settings()} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} />
      </section>
    </SidePanel>
  );
}

function GradientSpecimen() {
  const [settings, setSettings] = createSignal<GradientSettings>({
    kind: 'linear',
    repeat: 'none',
    stops: [
      { position: 0, color: 'foreground', alpha: 1 },
      { position: 1, color: 'background', alpha: 1 }
    ],
    opacity: 1,
    mixing: 'linear'
  });

  return (
    <SidePanel>
      <section>
        <GradientPanel
          settings={settings()}
          colors={{ foreground: '#c8553d', background: '#ffffff' }}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
      </section>
    </SidePanel>
  );
}

function SymmetrySpecimen() {
  const [symmetry, setSymmetry] = createSignal<PaintSymmetry>(defaultPaintSymmetry());

  return (
    <SidePanel>
      <section>
        <SymmetryPanel
          symmetry={symmetry()}
          disabled={false}
          inactive={false}
          viewCenter={{ x: 0, y: 0 }}
          onChange={setSymmetry}
        />
      </section>
    </SidePanel>
  );
}

function MixerSpecimen() {
  const [sample, setSample] = createSignal<ColorSample>(defaultColorSample);

  return (
    <SidePanel>
      <section>
        <MixerActions disabled={false} onLoad={() => {}} onClean={() => {}} onPick={() => {}} />
      </section>
      <section>
        <ColorPickerSettings
          source={sample().source}
          size={sample().size}
          onChange={(patch) => setSample((current) => ({ ...current, ...patch }))}
        />
      </section>
    </SidePanel>
  );
}

function QuickShapeSpecimen() {
  const [settings, setSettings] = createSignal<QuickShapePreferences>({ enabled: true, delay: 500 });

  return (
    <SidePanel>
      <section>
        <QuickShapeSettings
          settings={settings()}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
      </section>
    </SidePanel>
  );
}

/** Palm rejection's and the new tab's settings, on values of their own rather than Paint's. */
function PenSpecimen() {
  const [settings, setSettings] = createSignal<PalmRejectionSettings>(defaultPalmRejection);
  const [auto, setAuto] = createSignal(false);

  return (
    <SidePanel>
      <section>
        <PalmRejectionControls
          settings={settings()}
          penHovers
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
      </section>
      <section>
        <FreshTabControls auto={auto()} onChange={setAuto} />
      </section>
    </SidePanel>
  );
}

function ViewSpecimen() {
  const [options, setOptions] = createSignal<ViewOptions>({ smoothPixels: false, pixelGrid: true });

  return (
    <SidePanel>
      <section>
        <ViewOptionsControls
          settings={options()}
          onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
        />
      </section>
      <section>
        <PressureCalibrationControls calibrated={false} onOpen={() => {}} />
      </section>
    </SidePanel>
  );
}

/** Local undo's panel, closed, and the Erase to History source on the test layers' document. */
function HistorySpecimen() {
  const [settings, setSettings] = createSignal<LocalUndoSettings>({
    mode: 'brush',
    area: 'new',
    size: 80,
    hardness: 0.5
  });
  const [depth, setDepth] = createSignal(1);

  return (
    <SidePanel>
      <section>
        <LocalUndoPanel
          settings={settings()}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          depth={depth()}
          onDepth={setDepth}
          open={false}
          shown={undefined}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </section>
      <section>
        <SeededLayers layers={fourLayers}>
          {(layers) => <HistorySourceControl state={layers.state()} ready onChange={() => {}} />}
        </SeededLayers>
      </section>
    </SidePanel>
  );
}

/** The mixing palette as its window shows it; it loads the color it is pressed on into this specimen. */
function PaletteSpecimen() {
  const palette = createMixingPalette();
  const [color, setColor] = createSignal('#c8553d');

  return (
    <div class={styles.windowFrame}>
      <MixingPalette palette={palette} color={color()} onLoad={setColor} />
    </div>
  );
}

/** The transform's floating bar, placed in a box as wide as a screen's top. */
function TransformSpecimen() {
  const [settings, setSettings] = createSignal<TransformSettings>({
    proportional: true,
    interpolation: 'smooth',
    perspective: false
  });
  const [numbers, setNumbers] = createSignal(false);

  return (
    <div class={styles.barBox}>
      <TransformActions
        placement={{ left: 360, top: 24 }}
        settings={settings()}
        onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        onFlip={() => {}}
        onRotate={() => {}}
        distorted={false}
        perspective={false}
        onDistort={() => {}}
        warped={false}
        onWarp={() => {}}
        warpCells={4}
        onWarpGrid={() => {}}
        numbers={numbers()}
        onNumbers={setNumbers}
        onReset={() => {}}
        onCancel={() => {}}
        onDone={() => {}}
      />
    </div>
  );
}

/** The selection's floating bar over a selected square in a box as large as a small screen. */
function SelectionSpecimen() {
  const [selectionTool, setSelectionTool] = createSignal<SelectionTool>('lasso');
  const [mode, setMode] = createSignal<SelectionMode>('replace');
  const [wand, setWand] = createSignal<WandSettings>({
    tolerance: 32,
    contiguous: true,
    source: 'layer',
    antialias: true
  });
  const [tool, setTool] = createSignal<'lasso' | 'fill' | 'gradient'>('lasso');
  const size = { width: 720, height: 360 };

  return (
    <div class={styles.barBox} style={{ width: `${size.width}px`, height: `${size.height}px` }}>
      <SelectionActions
        outline={[
          { x: 260, y: 140 },
          { x: 460, y: 140 },
          { x: 460, y: 300 },
          { x: 260, y: 300 }
        ]}
        selected
        size={size}
        disabled={false}
        busy={false}
        hasClipboard={false}
        onAction={() => {}}
        onTransform={() => {}}
        onDeselect={() => {}}
        onSelectAll={() => {}}
        onInvert={() => {}}
        onFeather={() => {}}
        selectionTool={selectionTool()}
        onSelectionTool={setSelectionTool}
        mode={mode()}
        onMode={setMode}
        wand={wand()}
        onWand={(patch) => setWand((current) => ({ ...current, ...patch }))}
        tool={tool()}
        onTool={setTool}
        onFillSelection={() => {}}
      />
    </div>
  );
}
