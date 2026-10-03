import { For } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { PaintTool } from '../brush';
import styles from './PaintStudio.module.css';
import type { PanelId } from './StudioPanel';

/** Left tool rail: drawing tools, then the view mirror and the symmetry and layer panel toggles. */
export function ToolBar(props: {
  tool: PaintTool;
  /** The view is mirrored horizontally. */
  mirrored: boolean;
  /** Paint symmetry is on. */
  symmetry: boolean;
  /** The open side panel, if any. */
  panel: PanelId | undefined;
  onChooseTool: (tool: PaintTool) => void;
  onToggleMirror: () => void;
  /** Opens or closes `panel`; `target` receives focus again when the panel closes. */
  onTogglePanel: (panel: PanelId, target: HTMLElement) => void;
}) {
  return (
    <nav class={styles.tools} aria-label="Drawing tools">
      <For each={toolButtons}>
        {(button) => (
          <button
            aria-label={button.label}
            title={button.title}
            aria-pressed={props.tool === button.tool ? 'true' : 'false'}
            onClick={() => props.onChooseTool(button.tool)}
          >
            <SketchIcon name={button.icon} />
          </button>
        )}
      </For>
      <span class={styles.toolSeparator} />
      <button
        aria-label="Mirror canvas"
        title="Mirror view"
        aria-pressed={props.mirrored ? 'true' : 'false'}
        onClick={() => props.onToggleMirror()}
      >
        <SketchIcon name="mirror" />
      </button>
      <button
        aria-label="Paint symmetry"
        title="Paint symmetry"
        aria-pressed={props.symmetry ? 'true' : 'false'}
        aria-expanded={props.panel === 'symmetry' ? 'true' : 'false'}
        aria-controls="paint-panel"
        onClick={(event) => props.onTogglePanel('symmetry', event.currentTarget)}
      >
        <SketchIcon name="symmetry" />
      </button>
      <button
        aria-label="Layers"
        title="Layers"
        aria-expanded={props.panel === 'layers' ? 'true' : 'false'}
        aria-controls="paint-panel"
        onClick={(event) => props.onTogglePanel('layers', event.currentTarget)}
      >
        <SketchIcon name="layers" />
      </button>
    </nav>
  );
}

/** Tool buttons in toolbar order. */
const toolButtons = [
  { tool: 'brush', label: 'Brush', title: 'Brush · B', icon: 'draw' },
  { tool: 'abr-brush', label: 'ABR Brush', title: 'ABR Brush · experimental', icon: 'brush' },
  { tool: 'eraser', label: 'Eraser', title: 'Eraser · E', icon: 'erase' },
  { tool: 'lasso', label: 'Lasso', title: 'Lasso · L', icon: 'lasso' }
] as const satisfies readonly { tool: PaintTool; label: string; title: string; icon: string }[];
