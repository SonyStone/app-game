import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import type { SelectionTool } from '../../features/selection';
import type { PaintSession } from '../../features/session';
import type { ToolId } from './toolCatalog';

/**
 * What the entries of Infinite Painter's menus do in Paint: which ones Paint can run (`available`), which are on
 * (`active`), and running one (`run`). A tool entry toggles: running an active one returns to the painting tool, as
 * the close icon of Infinite Painter's tool mini-toolbars does. Entries without a counterpart in Paint are unavailable.
 *
 * - Fill, Gradient, the selection tools, Basic transform and local undo are Paint's tools.
 * - Lazy is Paint's stabilizer, switched on in the brush's stroke settings and back to the mode it replaced.
 * - Vertical, Horizontal, Radial and Kaleido are Paint's symmetry modes vertical, horizontal, radial and mandala,
 *   starting at the view's center.
 * - Fit resets the view and Flip mirrors it.
 * - The Options menu's New, Open, Save, Import and Settings come from `options`, since they open files or windows.
 */
export function createToolActions(
  session: PaintSession,
  options: {
    newDrawing: () => void;
    openDrawing: () => void;
    importImage: () => void;
    save: () => void;
    settings: () => void;
  }
) {
  const { tools, tool, chooseTool, symmetry, camera, selection, transform } = session;
  /** The stroke mode the Lazy guide replaced, restored when it is turned off. */
  let modeBeforeLazy: ReturnType<typeof tools.brush>['stroke']['mode'] = 'studio';

  const runs: Partial<Record<ToolId, () => void>> = {
    fill: () => toggleTool('fill'),
    gradient: () => toggleTool('gradient'),
    lazy: toggleLazy,
    fit: () => camera.reset(),
    flip: () => camera.toggleMirror(),
    transform: () => session.toggleTransform(),
    'local-undo': () => (tool() === 'local-undo' ? chooseTool(tools.slot()) : session.chooseLocalUndo()),
    new: options.newDrawing,
    open: options.openDrawing,
    save: options.save,
    import: options.importImage,
    settings: options.settings
  };

  return {
    available: availableInPaint,
    active(id: string): boolean {
      const selectionTool = selectionTools[id as ToolId];
      if (selectionTool) {
        return tool() === 'lasso' && !transform.active() && selection.tool() === selectionTool;
      }

      const mode = symmetryModes[id as ToolId];
      if (mode) {
        return symmetry.symmetry().mode === mode;
      }

      switch (id) {
        case 'fill':
        case 'gradient':
        case 'local-undo':
          return tool() === id && !transform.active();
        case 'lazy':
          return tools.brush().stroke.mode === 'stabilizer';
        case 'flip':
          return camera.camera().mirrored;
        case 'transform':
          return transform.active();
        default:
          return false;
      }
    },
    run(id: string) {
      const selectionTool = selectionTools[id as ToolId];
      if (selectionTool) {
        chooseSelectionTool(selectionTool);
        return;
      }

      const mode = symmetryModes[id as ToolId];
      if (mode) {
        toggleSymmetry(mode);
        return;
      }

      runs[id as ToolId]?.();
    }
  };

  function toggleTool(next: 'fill' | 'gradient') {
    chooseTool(tool() === next && !transform.active() ? tools.slot() : next);
  }

  function chooseSelectionTool(next: SelectionTool) {
    if (tool() === 'lasso' && selection.tool() === next) {
      chooseTool(tools.slot());
      return;
    }

    selection.setTool(next);
    chooseTool('lasso');
  }

  function toggleSymmetry(mode: PaintSymmetry['mode']) {
    const current = symmetry.symmetry();
    if (current.mode === mode) {
      symmetry.update({ ...current, mode: 'off' });
      return;
    }

    // A guide turned on starts at the center of the view.
    const center = current.mode === 'off' ? { x: camera.camera().x, y: camera.camera().y } : {};
    symmetry.update({ ...current, ...center, mode });
  }

  function toggleLazy() {
    const stroke = tools.brush().stroke;
    if (stroke.mode === 'stabilizer') {
      tools.updateBrush({ stroke: { ...stroke, mode: modeBeforeLazy } });
      return;
    }

    modeBeforeLazy = stroke.mode;
    tools.updateBrush({ stroke: { ...stroke, mode: 'stabilizer' } });
  }
}

/** Whether Paint has a counterpart of menu entry `id`, which `createToolActions` then runs. */
export function availableInPaint(id: string) {
  return id in selectionTools || id in symmetryModes || runIds.has(id);
}

/** The selection tools that the Select section's entries choose. */
const selectionTools: Partial<Record<ToolId, SelectionTool>> = {
  'select-lasso': 'lasso',
  'select-rect': 'rectangle',
  'select-wand': 'wand',
  'select-poly': 'polygon',
  'select-circle': 'ellipse'
};

/** The symmetry modes that the Symmetry section's entries turn on. */
const symmetryModes: Partial<Record<ToolId, PaintSymmetry['mode']>> = {
  vertical: 'vertical',
  horizontal: 'horizontal',
  radial: 'radial',
  kaleido: 'mandala'
};

/** The other entries `createToolActions` runs. */
const runIds = new Set<string>([
  'fill',
  'gradient',
  'lazy',
  'fit',
  'flip',
  'transform',
  'local-undo',
  'new',
  'open',
  'save',
  'import',
  'settings'
] satisfies ToolId[]);
