import type { LayerAction } from '@app-game/paint-core/document';
import { editable } from '@app-game/paint-core/input';
import { createEventListener } from '@solid-primitives/event-listener';
import type { PaintSession } from '../../features/session';
import type { DesktopTools } from './createDesktopTools';
import type { Workspace } from './createWorkspace';
import { isApple, matchesKeys } from './keys';
import { rotateView } from './viewDrag';

/**
 * The Desktop variant's commands: the menu bar's menus and the shortcuts that are not the session's own. Each
 * command has its label, its shortcut as menus show it, and whether it is available or checked now. Shortcuts that
 * `createPaintShortcuts` already handles (undo, save, select all, the tool letters, zoom…) are only shown; the others
 * are handled here, on `window` before the session's listener, outside text fields and open dialogs. Must be created
 * within a Solid owner.
 */
export function createDesktopCommands(options: {
  session: PaintSession;
  workspace: Workspace;
  tools: DesktopTools;
  /** Opens the file picker for a `.paint` or `.psd` drawing. */
  openDrawing: () => void;
  /** Opens the file picker for an image to place on a new layer. */
  importImage: () => void;
  openAbr: () => void;
  openFeather: () => void;
  openShortcuts: () => void;
  /** Opens the type-ahead's command line. */
  findCommand: () => void;
  /** Link back to the Paint experiments; omitted on standalone pages. */
  experimentsHref?: string;
}) {
  const { session, workspace, tools } = options;
  const { engine, selection, camera, transform, gradient } = session;
  const apple = isApple();
  const ready = () => session.ready();
  const activeLayer = () => engine.state().layers.find((layer) => layer.id === engine.state().activeId);
  const layerBelow = () => {
    const layers = engine.state().layers;
    const index = layers.findIndex((layer) => layer.id === engine.state().activeId);
    return index > 0 ? layers[index - 1] : undefined;
  };
  const layer = (action: LayerAction) => session.edit({ type: 'layer', action });
  const onActive = (make: (id: string) => LayerAction) => () => {
    const id = engine.state().activeId;
    if (id) {
      layer(make(id));
    }
  };
  const selected = () => ready() && selection.selected() && !selection.busy();
  const toggleLayer = (property: 'clipping' | 'alphaLock' | 'visible') => () => {
    const active = activeLayer();
    if (active) {
      layer({ type: 'update', id: active.id, patch: { [property]: !(active[property] ?? false) } });
    }
  };
  const duplicateOrCopy = () => {
    if (selected()) {
      selection.action('new-layer');
      return;
    }

    onActive((id) => ({ type: 'duplicate', id }))();
  };

  const menus: Menu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Open…', keys: 'Mod+O', run: options.openDrawing, enabled: ready },
        {
          label: 'Save as .paint',
          keys: 'Mod+S',
          session: true,
          run: () => session.edit({ type: 'download' }),
          enabled: ready
        },
        'separator',
        { label: 'Place image…', keys: 'Mod+Shift+O', run: options.importImage, enabled: ready },
        { label: 'Import ABR brushes…', run: options.openAbr },
        'separator',
        { label: 'Export PNG', keys: 'Mod+Shift+E', run: () => session.edit({ type: 'png' }), enabled: ready },
        { label: 'Export PSD', keys: 'Mod+Shift+S', run: () => session.edit({ type: 'psd' }), enabled: ready }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          keys: 'Mod+Z',
          session: true,
          run: session.undo,
          enabled: () => ready() && engine.state().canUndo
        },
        {
          label: 'Redo',
          keys: 'Mod+Shift+Z',
          session: true,
          run: session.redo,
          enabled: () => ready() && engine.state().canRedo
        },
        'separator',
        // Handled here with any tool; the session's own handle them only with the selection tools.
        { label: 'Cut', keys: 'Mod+X', run: () => selection.action('cut'), enabled: selected },
        { label: 'Copy', keys: 'Mod+C', run: () => selection.action('copy'), enabled: selected },
        {
          label: 'Paste',
          keys: 'Mod+V',
          run: () => selection.action('paste'),
          enabled: () => ready() && !selection.busy() && selection.hasClipboard()
        },
        { label: 'Clear', keys: 'Delete', run: () => selection.action('delete'), enabled: selected },
        { label: 'Fill with foreground', keys: 'Alt+Backspace', run: gradient.fillSelection, enabled: selected },
        'separator',
        {
          label: 'Free transform',
          keys: 'Mod+T',
          session: true,
          run: session.toggleTransform,
          enabled: ready,
          checked: transform.active
        },
        'separator',
        { label: 'Swap colors', keys: 'X', session: true, run: session.tools.swapColors },
        { label: 'Default colors', keys: 'D', session: true, run: session.tools.resetColors }
      ]
    },
    {
      id: 'select',
      label: 'Select',
      items: [
        { label: 'All', keys: 'Mod+A', session: true, run: selection.selectAll, enabled: ready },
        { label: 'Deselect', keys: 'Mod+D', session: true, run: selection.clear, enabled: selected },
        { label: 'Inverse', keys: 'Mod+Shift+I', session: true, run: selection.invert, enabled: selected },
        { label: 'Feather…', keys: 'Shift+F6', run: options.openFeather, enabled: selected },
        'separator',
        {
          label: 'Lasso',
          keys: 'L',
          session: true,
          run: () => {
            selection.setTool('lasso');
            tools.choose('select');
          },
          checked: () => tools.active() === 'select' && selection.tool() === 'lasso'
        },
        {
          label: 'Magic wand',
          keys: 'W',
          session: true,
          run: () => {
            selection.setTool('wand');
            tools.choose('select');
          },
          checked: () => tools.active() === 'select' && selection.tool() === 'wand'
        }
      ]
    },
    {
      id: 'layer',
      label: 'Layer',
      items: [
        { label: 'New layer', keys: 'Mod+Alt+Shift+N', run: () => layer({ type: 'add' }), enabled: ready },
        { label: 'Duplicate layer', keys: 'Mod+J', run: duplicateOrCopy, enabled: () => ready() && !selected() },
        { label: 'Layer via copy', keys: 'Mod+J', run: duplicateOrCopy, enabled: selected },
        {
          label: 'Merge down',
          keys: 'Mod+E',
          run: onActive((id) => ({ type: 'merge-down', id })),
          enabled: () => ready() && layerBelow() !== undefined
        },
        {
          label: 'Delete layer',
          run: onActive((id) => ({ type: 'delete', id })),
          enabled: () => ready() && engine.state().layers.length > 1
        },
        'separator',
        {
          label: 'Clipping mask',
          keys: 'Mod+Alt+G',
          run: toggleLayer('clipping'),
          enabled: ready,
          checked: () => activeLayer()?.clipping ?? false
        },
        {
          label: 'Lock transparent pixels',
          keys: '/',
          run: toggleLayer('alphaLock'),
          enabled: ready,
          checked: () => activeLayer()?.alphaLock ?? false
        },
        {
          label: 'Hide layer',
          keys: 'Mod+,',
          run: toggleLayer('visible'),
          enabled: ready,
          checked: () => activeLayer()?.visible === false
        },
        'separator',
        {
          label: 'Bring forward',
          keys: 'Mod+]',
          run: onActive((id) => ({ type: 'move', id, direction: 1 })),
          enabled: () => ready() && engine.state().layers.at(-1)?.id !== engine.state().activeId
        },
        {
          label: 'Send backward',
          keys: 'Mod+[',
          run: onActive((id) => ({ type: 'move', id, direction: -1 })),
          enabled: () => ready() && layerBelow() !== undefined
        }
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Zoom in', keys: 'Mod+=', session: true, run: () => camera.zoomBy(1.25) },
        { label: 'Zoom out', keys: 'Mod+-', session: true, run: () => camera.zoomBy(0.8) },
        { label: 'Actual pixels (100%)', keys: 'Mod+0', session: true, run: camera.resetZoom },
        { label: 'Reset view', keys: 'Mod+Shift+0', run: camera.reset },
        'separator',
        { label: 'Rotate left 15°', keys: '4', run: () => turn(-15) },
        { label: 'Rotate right 15°', keys: '6', run: () => turn(15) },
        { label: 'Reset rotation', keys: '5', run: camera.resetRotation },
        { label: 'Mirror view', keys: 'M', run: camera.toggleMirror, checked: () => camera.camera().mirrored },
        'separator',
        { label: 'Show panels', keys: 'Tab', run: workspace.togglePanels, checked: workspace.panelsShown },
        {
          label: 'Panels on the right (left hand)',
          run: () => workspace.setDock('right'),
          checked: () => workspace.layout().dock === 'right'
        },
        {
          label: 'Panels on the left (right hand)',
          run: () => workspace.setDock('left'),
          checked: () => workspace.layout().dock === 'left'
        },
        { label: 'Reset panel layout', run: workspace.reset },
        'separator',
        {
          label: 'Mixing palette',
          run: () => session.windows.toggle('palette'),
          checked: () => session.windows.isOpen('palette')
        },
        { label: 'Pen and palm rejection…', run: () => session.windows.open('pen') },
        { label: 'Calibrate pen pressure…', run: () => session.windows.open('pressure') },
        'separator',
        {
          label: 'Full screen',
          keys: 'Mod+Shift+F',
          run: () => void session.fullscreen.props.onClick(),
          enabled: () => document.fullscreenEnabled,
          checked: session.fullscreen.isActive
        }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'Find a command…', keys: 'Mod+K', run: options.findCommand },
        { label: 'Keyboard shortcuts', keys: 'F1', run: options.openShortcuts },
        ...(options.experimentsHref
          ? [
              'separator' as const,
              { label: 'Back to Paint experiments', run: () => location.assign(options.experimentsHref!) }
            ]
          : [])
      ]
    }
  ];

  /** Shortcuts of the tool column and others outside the menus, in the order the shortcuts sheet lists them. */
  const toolCommands: Command[] = [
    { label: 'Brush', keys: 'B', session: true, run: () => tools.choose('brush') },
    { label: 'Eraser', keys: 'E', session: true, run: () => tools.choose('eraser') },
    { label: 'Fill', keys: 'G', session: true, run: () => tools.choose('fill') },
    { label: 'Gradient', keys: 'Shift+G', run: () => tools.choose('gradient') },
    { label: 'Eyedropper', keys: 'I', run: () => tools.choose('eyedropper') },
    { label: 'Hand', keys: 'H', run: () => tools.chooseView('hand') },
    { label: 'Zoom tool', keys: 'Z', run: () => tools.chooseView('zoom') },
    { label: 'Rotate view', keys: 'R', run: () => tools.chooseView('rotate') },
    { label: 'Smaller brush', keys: '[', session: true, run: () => session.tools.scaleSize(0.8) },
    { label: 'Larger brush', keys: ']', session: true, run: () => session.tools.scaleSize(1.25) },
    { label: 'Keyboard shortcuts', keys: '?', run: options.openShortcuts }
  ];

  const handled = [...menus.flatMap((menu) => menu.items), ...toolCommands].filter(
    (item): item is Command & { keys: string } => item !== 'separator' && item.keys !== undefined && !item.session
  );

  createEventListener(
    window,
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.isComposing || editable(event.target)) {
        return;
      }

      if (event.target instanceof Element && event.target.closest('dialog[open]')) {
        return;
      }

      // The session's tool letters leave the view tools.
      if (!event.ctrlKey && !event.metaKey && !event.altKey && /^Key[BELGW]$/.test(event.code)) {
        tools.leaveView();
      }

      const matching = handled.filter((candidate) => matchesKeys(event, candidate.keys, apple));
      if (matching.length === 0) {
        return;
      }

      // Before the session's listener, which would also take Shift+G for the fill, and before the browser's own use of
      // the keys, also while the command is unavailable.
      event.preventDefault();
      event.stopPropagation();
      matching.find((command) => command.enabled?.() ?? true)?.run();
    },
    { capture: true }
  );

  return {
    menus,
    toolCommands,
    /** Shortcuts are shown with Cmd and the Mac's symbols. */
    apple
  };

  function turn(degrees: number) {
    camera.navigate(rotateView(camera.current(), session.size(), degrees));
  }
}

/** A command of a menu or the shortcuts sheet. */
export type Command = {
  label: string;
  /** The shortcut, written as `keys.ts` reads it, such as `Mod+Shift+N`. */
  keys?: string;
  /** The session's own shortcuts handle `keys`; the command only shows it. */
  session?: boolean;
  run: () => void;
  /** Whether the command can run now; always when omitted. */
  enabled?: () => boolean;
  /** Whether the command's setting is on, for a check mark; it has none when omitted. */
  checked?: () => boolean;
};

/** A menu of the menu bar: commands and the separators between their groups. */
export type Menu = { id: string; label: string; items: (Command | 'separator')[] };
