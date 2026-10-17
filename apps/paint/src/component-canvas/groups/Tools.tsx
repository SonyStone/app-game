import { defaultBrush } from '@app-game/paint-core/brush';
import type { SelectionMode } from '@app-game/paint-core/selectionMask';
import { createSignal } from 'solid-js';
import type { PaintTool } from '../../features/brush';
import type { SelectionTool, WandSettings } from '../../features/selection';
import type { PanelId } from '../../features/studio/StudioPanel';
import { ToolBar } from '../../features/studio/ToolBar';
import type { DesktopTool } from '../../variants/desktop/createDesktopTools';
import { ToolColumn } from '../../variants/desktop/ToolColumn';
import { availableInPaint } from '../../variants/infinite/createToolActions';
import { MainToolbar, type ToolbarMode } from '../../variants/infinite/MainToolbar';
import { creativeTools, editingTools } from '../../variants/infinite/toolCatalog';
import { ToolsMenu } from '../../variants/infinite/ToolsMenu';
import procreate from '../../variants/procreate/ProcreateStudio.module.css';
import { SelectionToolbar } from '../../variants/procreate/SelectionToolbar';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, InfiniteFrame, StudioFrame } from '../frames';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Tools: the rails and bars that choose a tool in each UI, each choosing on its own. The Puck variant's tool pill and
 * the Zen fan are drawn by their clusters (see Pucks and Whole UIs).
 */
export function Tools() {
  return (
    <CanvasGroup
      id="tools"
      title="Tools"
      omitted={
        <>
          Not here: the Puck variant's tool pill, which is part of its cluster and reads the drawing session; the Puck
          gallery's tool cards and strips (see Whole UIs).
        </>
      }
    >
      <CanvasRow title="Tool rails" note="a press chooses, as in the app">
        <Specimen id="tools/rails/studio" label="Studio" part="studio-tools">
          <StudioRail />
        </Specimen>
        <Specimen id="tools/rails/desktop" label="Desktop">
          <DesktopColumn />
        </Specimen>
      </CanvasRow>

      <CanvasRow
        title="Infinite Painter"
        note="its main toolbar, whose buttons slide on a drag, and its tools menus; greyed entries are not in Paint"
      >
        <Specimen id="tools/infinite/toolbar" label="Main toolbar">
          <InfiniteToolbar />
        </Specimen>
        <Specimen id="tools/infinite/creative" label="Creative Tools menu">
          <InfiniteMenu label="Creative Tools" sections={creativeTools} />
        </Specimen>
        <Specimen id="tools/infinite/editing" label="Editing Tools menu">
          <InfiniteMenu label="Editing Tools" sections={editingTools} />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Selection" note="the Procreate variant's bar while a selection tool is chosen">
        <Specimen id="tools/selection/procreate" label="Procreate selection bar">
          <ProcreateSelection />
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Studio's left tool rail at the left edge of a screen-high box, with its mirror, symmetry and panel toggles. */
function StudioRail() {
  const [tool, setTool] = createSignal<PaintTool>('brush');
  const [mirrored, setMirrored] = createSignal(false);
  const [panel, setPanel] = createSignal<PanelId>();

  return (
    <StudioFrame width={120} height={560}>
      <ToolBar
        tool={tool()}
        mirrored={mirrored()}
        symmetry={false}
        panel={panel()}
        transforming={false}
        onTransform={() => {}}
        onChooseTool={setTool}
        onToggleMirror={() => setMirrored((on) => !on)}
        onTogglePanel={(id) => setPanel((open) => (open === id ? undefined : id))}
      />
    </StudioFrame>
  );
}

/** The Desktop variant's tool column with its foreground and background swatches. */
function DesktopColumn() {
  const [tool, setTool] = createSignal<DesktopTool>('brush');
  const [colors, setColors] = createSignal({ foreground: '#c8553d', background: '#ffffff' });
  const [editing, setEditing] = createSignal<'color' | 'backgroundColor'>('color');

  return (
    <DesktopFrame>
      <div class={styles.desktopColumn}>
        <ToolColumn
          active={tool()}
          selected={false}
          foreground={colors().foreground}
          background={colors().background}
          editing={editing()}
          onChoose={setTool}
          onEditColor={setEditing}
          onSwap={() => setColors((current) => ({ foreground: current.background, background: current.foreground }))}
          onReset={() => setColors({ foreground: '#000000', background: '#ffffff' })}
        />
      </div>
    </DesktopFrame>
  );
}

/**
 * The Procreate variant's selection bar at the bottom of a box as wide as the variant's screen, as if something were
 * selected. Its commands do nothing here.
 */
function ProcreateSelection() {
  const [tool, setTool] = createSignal<SelectionTool>('lasso');
  const [mode, setMode] = createSignal<SelectionMode>('replace');
  const [wand, setWand] = createSignal<WandSettings>({
    tolerance: 32,
    contiguous: true,
    source: 'layer',
    antialias: true
  });

  return (
    <div class={[procreate.editor, styles.procreateScreenStrip]}>
      <SelectionToolbar
        tool={tool()}
        onTool={setTool}
        mode={mode()}
        onMode={setMode}
        selected
        disabled={false}
        wand={wand()}
        onWand={(patch) => setWand((current) => ({ ...current, ...patch }))}
        onInvert={() => {}}
        onFeather={() => {}}
        onColorFill={() => {}}
        onClear={() => {}}
      />
    </div>
  );
}

/**
 * The Infinite Painter variant's main toolbar on a brush of its own: the modes choose, Size, Color and Opacity slide on
 * a drag; their pop-ups and the eyedropper belong to the variant and do nothing here, nor does the two-finger move.
 */
function InfiniteToolbar() {
  const [mode, setMode] = createSignal<ToolbarMode>('brush');
  const [brush, setBrush] = createSignal({ ...defaultBrush(), color: '#c8553d' });
  const [size, setSize] = createSignal(0.55);

  return (
    <InfiniteFrame width={96} height={330}>
      <MainToolbar
        mode={mode()}
        onMode={setMode}
        onBrushes={() => {}}
        sizeFraction={size()}
        onSize={setSize}
        onSizeTap={() => {}}
        opacityValue={brush().opacity}
        opacityLabel="Opacity"
        onOpacity={(opacity) => setBrush((current) => ({ ...current, opacity }))}
        onOpacityTap={() => {}}
        color={brush().color}
        brightness={0.78}
        onBrightness={() => {}}
        onColorTap={() => {}}
        onEyedropper={() => {}}
        onReadout={() => {}}
        position={{ x: 20, y: 20 }}
        onMove={() => {}}
      />
    </InfiniteFrame>
  );
}

/** An Infinite Painter tools menu whose entries Paint has toggle on and off here. */
function InfiniteMenu(props: { label: string; sections: Parameters<typeof ToolsMenu>[0]['sections'] }) {
  const [active, setActive] = createSignal(new Set<string>(['vertical']));

  return (
    <InfiniteFrame>
      <ToolsMenu
        label={props.label}
        sections={props.sections}
        available={availableInPaint}
        active={(id) => active().has(id)}
        onRun={(id) =>
          setActive((current) => {
            const next = new Set(current);
            if (!next.delete(id)) {
              next.add(id);
            }

            return next;
          })
        }
      />
    </InfiniteFrame>
  );
}
