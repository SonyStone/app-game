import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createSignal } from 'solid-js';
import { parsedEntry, searchPalette, suggestions, type PaletteContext } from '../../features/commands';
import type { QuickShapePreferences } from '../../features/quickshape';
import { createFullscreenToggle } from '../../features/session/createFullscreenToggle';
import { DrawingMenu } from '../../features/studio/DrawingMenu';
import { StudioPanel } from '../../features/studio/StudioPanel';
import { ViewControls } from '../../features/studio/ViewControls';
import { CommandPalette } from '../../variants/command/CommandPalette';
import { Swatches } from '../../variants/demos/Swatches';
import type { Menu } from '../../variants/desktop/createDesktopCommands';
import { MenuBar } from '../../variants/desktop/MenuBar';
import { availableInPaint } from '../../variants/infinite/createToolActions';
import { HistoryControls } from '../../variants/infinite/HistoryControls';
import { OptionsMenu } from '../../variants/infinite/OptionsMenu';
import { Readout } from '../../variants/infinite/Readout';
import { findTool } from '../../variants/infinite/toolCatalog';
import { TopBar, type TopBarMenu } from '../../variants/infinite/TopBar';
import { ActionsPopover } from '../../variants/procreate/ActionsPopover';
import { GalleryPopover } from '../../variants/procreate/GalleryPopover';
import { MoreSheet } from '../../variants/zen/MoreSheet';
import styles from '../ComponentCanvas.module.css';
import { DesktopFrame, InfiniteFrame, StudioFrame, ZenFrame } from '../frames';
import { ProcreateFrame } from '../ProcreateFrame';
import { fourLayers, SeededLayers } from '../seededLayers';
import { CanvasGroup, CanvasRow, Specimen } from '../Specimen';

/**
 * Panels and menus: the menus, popovers, sheets and bars around the drawing in each UI, on test data. Their commands
 * change only the specimen: opening files, exporting and the session's windows do nothing here.
 */
export function Panels() {
  return (
    <CanvasGroup
      id="panels"
      title="Panels"
      omitted={
        <>
          Not here: the Desktop variant's options and status bars and its dock, and Studio's top bar, which read the
          drawing session itself (see Whole UIs); the Desktop shortcut sheet, which opens modally over the page.
        </>
      }
    >
      <CanvasRow title="Drawing and actions menus">
        <Specimen id="panels/menus/studio-drawing" label="Studio: Drawing panel">
          <StudioDrawingPanel />
        </Specimen>
        <Specimen id="panels/menus/procreate-gallery" label="Procreate: Gallery">
          <ProcreateFrame width={300} label="Gallery">
            <GalleryPopover
              ready
              onOpen={() => {}}
              onInsertImage={() => {}}
              onSave={() => {}}
              onExportPng={() => {}}
              onExportPsd={() => {}}
              onResetView={() => {}}
            />
          </ProcreateFrame>
        </Specimen>
        <Specimen id="panels/menus/procreate-actions" label="Procreate: Actions">
          <ProcreateActions />
        </Specimen>
        <Specimen id="panels/menus/zen-more" label="Zen: more sheet">
          <ZenMore />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Bars">
        <Specimen id="panels/bars/desktop-menu" label="Desktop: menu bar">
          <DesktopMenus />
        </Specimen>
        <Specimen id="panels/bars/studio-view" label="Studio: view controls">
          <StudioView />
        </Specimen>
      </CanvasRow>

      <CanvasRow
        title="Infinite Painter"
        note="the top bar with two docked icons, the Options menu, Undo and the readout"
      >
        <Specimen id="panels/infinite/top-bar" label="Top bar">
          <InfiniteTopBar />
        </Specimen>
        <Specimen id="panels/infinite/options" label="Options menu">
          <InfiniteFrame>
            <OptionsMenu available={availableInPaint} onRun={() => {}} onExport={() => {}} />
          </InfiniteFrame>
        </Specimen>
        <Specimen id="panels/infinite/history" label="Undo, Redo and the history slider">
          <InfiniteHistory />
        </Specimen>
        <Specimen id="panels/infinite/readout" label="Size readout">
          <InfiniteFrame width={280} height={340}>
            <Readout text="Size: 80 px" ring={{ current: 80, max: 200 }} color="#c8553d" />
          </InfiniteFrame>
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Typed commands" note="the Command variant's palette on the test layers and Paint's presets">
        <Specimen id="panels/commands/palette" label="Command palette">
          <Palette />
        </Specimen>
      </CanvasRow>

      <CanvasRow title="Swatches" note="the feature demos' color row">
        <Specimen id="panels/swatches/demos" label="Demo swatches">
          <DemoSwatches />
        </Specimen>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Studio's Drawing panel as its side panel shows it, in a screen-high box: the panel keeps to the right edge. */
function StudioDrawingPanel() {
  const [pinned, setPinned] = createSignal(false);

  return (
    <StudioFrame width={440} height={640}>
      <StudioPanel id="file" title="Drawing" pinned={pinned()} onPinnedChange={setPinned} onClose={() => {}}>
        <DrawingMenu
          ready
          onOpen={() => {}}
          onPlaceImage={() => {}}
          onSave={() => {}}
          onExportPng={() => {}}
          onExportPsd={() => {}}
          onResetView={() => {}}
          onDeveloper={() => {}}
        />
      </StudioPanel>
    </StudioFrame>
  );
}

/** The Procreate variant's Actions popover; its switches change only the specimen. */
function ProcreateActions() {
  const [mirrored, setMirrored] = createSignal(false);
  const [symmetry, setSymmetry] = createSignal<PaintSymmetry['mode']>('off');
  const [sidebar, setSidebar] = createSignal<'left' | 'right'>('left');
  const [quickShape, setQuickShape] = createSignal<QuickShapePreferences>({ enabled: true, delay: 500 });

  return (
    <ProcreateFrame width={360} label="Actions">
      <ActionsPopover
        ready
        selected={false}
        hasClipboard={false}
        mirrored={mirrored()}
        symmetry={symmetry()}
        sidebar={sidebar()}
        fullscreen={{ active: false, supported: false, shown: true }}
        onInsertPhoto={() => {}}
        onSelectionAction={() => {}}
        onFlip={() => setMirrored((on) => !on)}
        onSymmetry={setSymmetry}
        onResetView={() => {}}
        onResetRotation={() => {}}
        onShare={() => {}}
        onSidebar={setSidebar}
        onFullscreen={() => {}}
        onPen={() => {}}
        quickShape={quickShape()}
        onQuickShape={(patch) => setQuickShape((current) => ({ ...current, ...patch }))}
      />
    </ProcreateFrame>
  );
}

/** The Zen variant's more sheet: the test layers, files and settings. */
function ZenMore() {
  const [hand, setHand] = createSignal<'left' | 'right'>('right');
  const [quickShape, setQuickShape] = createSignal<QuickShapePreferences>({ enabled: true, delay: 500 });

  return (
    <ZenFrame width={340}>
      <SeededLayers layers={fourLayers}>
        {(layers) => (
          <MoreSheet
            state={layers.state()}
            ready
            onLayer={layers.onAction}
            onExport={() => {}}
            onOpen={() => {}}
            onInsertImage={() => {}}
            onImportBrushes={() => {}}
            paletteOpen={false}
            onPalette={() => {}}
            localUndo={false}
            onLocalUndo={() => {}}
            onPen={() => {}}
            hand={hand()}
            onHand={setHand}
            fullscreen={{ active: false, supported: false }}
            onFullscreen={() => {}}
            quickShape={quickShape()}
            onQuickShape={(patch) => setQuickShape((current) => ({ ...current, ...patch }))}
          />
        )}
      </SeededLayers>
    </ZenFrame>
  );
}

/** The Desktop variant's menu bar with its menus' titles and a few of their commands, which do nothing here. */
function DesktopMenus() {
  const [open, setOpen] = createSignal<string>();
  const command = (label: string, keys?: string) => ({ label, keys, run: () => setOpen(undefined) });

  return (
    <DesktopFrame width={640}>
      <div class={styles.desktopMenus}>
        <MenuBar menus={menus(command)} open={open()} onOpen={setOpen} apple={false} />
      </div>
    </DesktopFrame>
  );
}

/** Test menus after the Desktop variant's own: its titles, with some of each menu's commands. */
function menus(command: (label: string, keys?: string) => Menu['items'][number]): Menu[] {
  return [
    {
      id: 'file',
      label: 'File',
      items: [command('Open…', 'Mod+O'), command('Save', 'Mod+S'), 'separator', command('Export PNG')]
    },
    { id: 'edit', label: 'Edit', items: [command('Undo', 'Mod+Z'), command('Redo', 'Mod+Shift+Z')] },
    {
      id: 'select',
      label: 'Select',
      items: [command('All', 'Mod+A'), command('Deselect', 'Mod+D'), command('Invert')]
    },
    { id: 'layer', label: 'Layer', items: [command('New layer', 'Mod+Shift+N'), command('Merge down', 'Mod+E')] },
    { id: 'view', label: 'View', items: [command('Fit', 'Mod+0'), command('Mirror'), command('Mixing palette')] }
  ];
}

/** Studio's zoom and rotation controls at the top of a screen-wide box. */
function StudioView() {
  const [box, setBox] = createSignal<HTMLElement>();
  const [zoom, setZoom] = createSignal(1);
  const [angle, setAngle] = createSignal(15);
  const fullscreen = createFullscreenToggle(box, () => {});

  return (
    <div ref={setBox}>
      <StudioFrame width={420} height={72}>
        <ViewControls
          fullscreen={fullscreen}
          zoom={zoom()}
          angle={angle()}
          onZoomBy={(factor) => setZoom((current) => Math.min(64, Math.max(0.05, current * factor)))}
          onResetZoom={() => setZoom(1)}
          onResetRotation={() => setAngle(0)}
        />
      </StudioFrame>
    </div>
  );
}

/**
 * The Command variant's palette, searching the test layers and Paint's presets as the variant searches the drawing's.
 * Its suggestions are the variant's for a brush with nothing to undo; running a command does nothing here.
 */
function Palette() {
  const [query, setQuery] = createSignal('');
  const context: PaletteContext = {
    presets: [
      { id: 'builtin:soft-round', name: 'Soft round' },
      { id: 'builtin:eraser', name: 'Eraser' }
    ],
    layers: fourLayers.map((layer) => ({ name: layer.name })),
    layerDetails: fourLayers.map((layer) => ({ visible: layer.visible ?? true, opacity: 1, blend: 'normal' })),
    activeLayer: fourLayers.length,
    mixer: false,
    playground: false
  };
  const suggested = suggestions({ tool: 'brush', selected: false, canUndo: false, canRedo: false }).map((intent) =>
    parsedEntry([intent], context)
  );

  return (
    <div class={styles.paletteBox}>
      <CommandPalette
        query={query()}
        onQuery={setQuery}
        entries={searchPalette(query(), context)}
        chips={[{ title: 'Suggested', entries: suggested }]}
        status={[
          { value: 'Brush', query: 'tool', title: 'Tool' },
          { value: '32', unit: 'px', query: 'size', title: 'Brush size' },
          { value: '#c8553d', swatch: '#c8553d', query: 'color', title: 'Color' }
        ]}
        autofocus={false}
        voice={{ supported: false, listening: false, heard: '' }}
        onVoice={() => {}}
        onRun={() => setQuery('')}
        onClose={() => setQuery('')}
      />
    </div>
  );
}

/** The feature demos' swatches, choosing the color of their own. */
function DemoSwatches() {
  const [color, setColor] = createSignal('#1d1d1f');

  return (
    <div class={styles.studioPanel}>
      <section>
        <Swatches color={color()} onPick={setColor} />
      </section>
    </div>
  );
}

/**
 * The Infinite Painter variant's top bar on a strip of drawing, with Fill and Flip docked; its buttons only mark
 * their menus here, and docked icons do not drag.
 */
function InfiniteTopBar() {
  const [open, setOpen] = createSignal<TopBarMenu>();
  const [layers, setLayers] = createSignal(true);

  return (
    <InfiniteFrame width={720} height={64}>
      <TopBar
        open={open()}
        onMenu={(menu) => setOpen((current) => (current === menu ? undefined : menu))}
        layersOpen={layers()}
        onLayers={() => setLayers((shown) => !shown)}
        selection
        docked={['fill', 'flip'].flatMap((id) => findTool(id) ?? [])}
        available={availableInPaint}
        active={() => false}
        onRun={() => {}}
        onDockDragStart={() => {}}
        dockArea={() => {}}
      />
    </InfiniteFrame>
  );
}

/** The Infinite Painter variant's undo corner on a history of twelve steps that its buttons and slider walk. */
function InfiniteHistory() {
  const [current, setCurrent] = createSignal(9);
  const states = 12;

  return (
    <InfiniteFrame width={520} height={150}>
      <HistoryControls
        canUndo={current() > 0}
        canRedo={current() < states - 1}
        states={states}
        current={current()}
        onUndo={() => setCurrent((step) => Math.max(0, step - 1))}
        onRedo={() => setCurrent((step) => Math.min(states - 1, step + 1))}
        onStep={(steps) => setCurrent((step) => Math.max(0, Math.min(states - 1, step + steps)))}
      />
    </InfiniteFrame>
  );
}
