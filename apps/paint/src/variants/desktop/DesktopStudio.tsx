import { NavigationPuck } from '@app-game/navigation-puck';
import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, Errored, Show } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { BrushList } from './BrushList';
import { ColorPanel } from './ColorPanel';
import { IconButton } from './controls';
import { createDesktopCommands } from './createDesktopCommands';
import { createDesktopTools } from './createDesktopTools';
import { createWorkspace } from './createWorkspace';
import styles from './DesktopStudio.module.css';
import { Dock, WidthSash } from './Dock';
import { LayersPanel } from './LayersPanel';
import { MenuBar } from './MenuBar';
import { OptionsBar } from './OptionsBar';
import { FeatherBox, Popup, ShortcutsSheet } from './Popup';
import { StatusBar } from './StatusBar';
import { ToolColumn } from './ToolColumn';
import { ViewToolLayer } from './ViewToolLayer';

/**
 * The Desktop variant: a docked workspace after Blender and Photoshop, for a big screen with mouse, keyboard and pen,
 * still usable on a 1280×800 tablet. A menu bar (File, Edit, Select, Layer, View, Help) with every command and its
 * shortcut, the options bar of the tool in use, the tool column with the foreground and background colors, the dock
 * with the Color, Brushes and Layers panels (collapsible, resizable, on either side), and the status bar. The canvas
 * is the middle cell only; nothing floats over it but the menus and popups, which a press outside closes (on the
 * canvas without painting). Tab hides the panels. The layout is remembered.
 *
 * Fingers on the canvas keep the session's gestures (two fingers pan, zoom and rotate, two- and three-finger taps
 * undo and redo); the session's palm rejection ignores a palm beside the pen, on the canvas and the interface alike.
 */
export function DesktopStudio(props: PaintVariantProps) {
  const [popup, setPopup] = createSignal<OpenPopup>();
  const session = createPaintSession({ panel: () => popupName(popup()) });
  const { engine, brush, tools: brushTools, camera, mixer, colorPicker, presets, images } = session;
  const workspace = createWorkspace();
  const tools = createDesktopTools(session);
  const [colorTarget, setColorTarget] = createSignal<'color' | 'backgroundColor'>('color');
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  let drawingInput!: HTMLInputElement;
  let imageInput!: HTMLInputElement;

  const commands = createDesktopCommands({
    session,
    workspace,
    tools,
    openDrawing: () => drawingInput.click(),
    importImage: () => imageInput.click(),
    openAbr,
    openFeather,
    openShortcuts: () => {
      setPopup(undefined);
      setShortcutsOpen(true);
    },
    experimentsHref: props.experimentsHref
  });
  session.createShortcuts({
    closePanel() {
      if (!popup()) {
        return false;
      }

      setPopup(undefined);
      return true;
    }
  });

  // A press outside the open menu or popup closes it; on the canvas it only closes it, as desktop menus do.
  createEventListener(
    document,
    'pointerdown',
    (event) => {
      const open = popup();
      const target = event.target;
      if (!open || !(target instanceof Element) || target.closest('[data-popup]')) {
        return;
      }

      // The preset button toggles its picker itself.
      if (open.kind === 'presets' && open.anchor.contains(target)) {
        return;
      }

      setPopup(undefined);
      if (target instanceof HTMLCanvasElement) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    { capture: true }
  );

  const layout = () => workspace.layout();
  const openMenu = () => {
    const open = popup();
    return open?.kind === 'menu' ? open.id : undefined;
  };
  const anchorOf = (kind: 'presets' | 'feather') => {
    const open = popup();
    return open?.kind === kind ? open.anchor : undefined;
  };

  return (
    <PaintEditor session={session} class={styles.editor}>
      <div class={styles.menuRow}>
        <Errored fallback={null}>
          <MenuBar
            menus={commands.menus}
            open={openMenu()}
            apple={commands.apple}
            onOpen={(id) => setPopup(id ? { kind: 'menu', id } : undefined)}
          >
            <IconButton
              icon="undo"
              label="Undo"
              title="Undo · two-finger tap"
              disabled={!session.ready() || !engine.state().canUndo}
              onClick={session.undo}
            />
            <IconButton
              icon="redo"
              label="Redo"
              title="Redo · three-finger tap"
              disabled={!session.ready() || !engine.state().canRedo}
              onClick={session.redo}
            />
            <IconButton
              icon={session.fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'}
              label="Full screen"
              pressed={session.fullscreen.isActive()}
              disabled={!document.fullscreenEnabled}
              onClick={() => void session.fullscreen.props.onClick()}
            />
          </MenuBar>
        </Errored>
      </div>
      <Show when={workspace.panelsShown()}>
        <div class={styles.optionsRow}>
          <Errored fallback={null}>
            <OptionsBar
              session={session}
              tools={tools}
              onPresets={(anchor) => setPopup(anchorOf('presets') === anchor ? undefined : { kind: 'presets', anchor })}
              onFeather={openFeather}
            />
          </Errored>
        </div>
      </Show>
      <div
        class={styles.main}
        data-dock={layout().dock}
        data-panels={workspace.panelsShown() ? 'true' : 'false'}
        style={{ '--dock-width': `${layout().width}px` }}
      >
        <Show when={workspace.panelsShown()}>
          <div class={styles.toolsCell}>
            <Errored fallback={null}>
              <ToolColumn
                active={tools.active()}
                selected={session.selection.selected()}
                foreground={brush().color}
                background={brush().backgroundColor ?? '#ffffff'}
                editing={colorTarget()}
                onChoose={tools.choose}
                onEditColor={(which) => {
                  setColorTarget(which);
                  workspace.reveal('color');
                }}
                onSwap={brushTools.swapColors}
                onReset={brushTools.resetColors}
              />
            </Errored>
          </div>
        </Show>
        <div class={styles.canvasCell}>
          <PaintStage session={session}>
            <StageGuides session={session} />
            <StageOverlays session={session} cursor={!tools.viewMode()} />
            <Show when={tools.viewMode()}>{(mode) => <ViewToolLayer session={session} mode={mode()} />}</Show>
            <Show when={camera.navigation.center()}>
              <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
            </Show>
          </PaintStage>
          <div class={styles.notices}>
            <SessionNotices session={session} />
          </div>
        </div>
        <Show when={workspace.panelsShown()}>
          <div class={styles.sashCell}>
            <WidthSash workspace={workspace} />
          </div>
          <div class={styles.dockCell}>
            <Errored fallback={<p class={styles.failed}>The panels failed to open.</p>}>
              <Dock
                workspace={workspace}
                panels={{
                  color: {
                    title: 'Color',
                    maxHeight: 330,
                    body: (
                      <ColorPanel
                        foreground={brush().color}
                        background={brush().backgroundColor ?? '#ffffff'}
                        target={colorTarget()}
                        onTarget={setColorTarget}
                        onChange={brushTools.updateBrush}
                      />
                    )
                  },
                  brushes: {
                    title: 'Brushes',
                    body: <BrushList session={session} onImport={openAbr} />
                  },
                  layers: {
                    title: 'Layers',
                    body: (
                      <LayersPanel
                        layers={engine.state().layers}
                        activeId={engine.state().activeId}
                        ready={session.ready()}
                        onAction={(action) => session.edit({ type: 'layer', action })}
                      />
                    )
                  }
                }}
              />
            </Errored>
          </div>
        </Show>
      </div>
      <div class={styles.statusRow}>
        <Errored fallback={null}>
          <StatusBar session={session} tool={tools.active()} />
        </Errored>
      </div>
      <Show when={anchorOf('presets')}>
        {(anchor) => (
          <Errored fallback={null}>
            <Popup anchor={anchor()} width={320} label="Brush presets">
              <BrushList session={session} onImport={openAbr} onChosen={() => setPopup(undefined)} />
            </Popup>
          </Errored>
        )}
      </Show>
      <Show when={anchorOf('feather')}>
        {(anchor) => (
          <Popup anchor={anchor()} width={300} label="Feather selection">
            <FeatherBox session={session} onDone={() => setPopup(undefined)} />
          </Popup>
        )}
      </Show>
      <Show when={shortcutsOpen()}>
        <ShortcutsSheet
          menus={commands.menus}
          tools={commands.toolCommands}
          apple={commands.apple}
          onClose={() => setShortcutsOpen(false)}
        />
      </Show>
      <input
        ref={drawingInput}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => picked(event, (file) => session.edit({ type: 'import', file }))}
      />
      <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => picked(event, images.place)} />
      <Show when={abrMounted()}>
        <AbrViewerDialog
          open={abrOpen()}
          close={() => setAbrOpen(false)}
          mixing={brush().mixing}
          onMixingChange={(mixing) => brushTools.updateBrush({ mixing })}
          onUseBrush={(asset) => {
            mixer.cancelPick();
            colorPicker.cancel();
            return presets.useBrush(asset);
          }}
        />
      </Show>
    </PaintEditor>
  );

  /** Opens the Feather box under the options bar's Feather button, or under the Select menu without it. */
  function openFeather() {
    const anchor =
      document.querySelector<HTMLElement>('[data-feather-anchor]') ??
      document.querySelector<HTMLElement>('[data-menu="select"]');
    if (anchor) {
      setPopup({ kind: 'feather', anchor });
    }
  }

  /** Opens the ABR brush importer. */
  function openAbr() {
    setPopup(undefined);
    setAbrMounted(true);
    setAbrOpen(true);
  }
}

/** The open menu or popup: a menu of the menu bar, or a popup under the toolbar button or menu that opened it. */
type OpenPopup = { kind: 'menu'; id: string } | { kind: 'presets' | 'feather'; anchor: HTMLElement };

/** The open menu or popup's name for input recordings. */
function popupName(open: OpenPopup | undefined) {
  return open && (open.kind === 'menu' ? `menu:${open.id}` : open.kind);
}

/** Passes the file chosen in a file input to `use`, and clears the input so the same file can be chosen again. */
function picked(event: Event & { currentTarget: HTMLInputElement }, use: (file: File) => void) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    use(file);
  }
}
