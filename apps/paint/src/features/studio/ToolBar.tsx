import { For, Show } from 'solid-js';
import { createHoverHints } from '../../shared/ui/createHoverHints';
import { HintCard } from '../../shared/ui/HintCard';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { PaintTool } from '../brush';
import styles from './PaintStudio.module.css';
import type { PanelId } from './StudioPanel';
import { toolHints } from './toolHints';

/**
 * Left tool rail: drawing tools and the transform, then the view mirror and the symmetry and layer panel toggles. A pen
 * or mouse resting on a button shows its visual hint beside the rail; see `HintCard`.
 */
export function ToolBar(props: {
  tool: PaintTool;
  /** The view is mirrored horizontally. */
  mirrored: boolean;
  /** Paint symmetry is on. */
  symmetry: boolean;
  /** The open side panel, if any. */
  panel: PanelId | undefined;
  /** A transform is in progress. */
  transforming: boolean;
  /** Starts a transform of the selection or the active layer, or applies the one in progress. */
  onTransform: () => void;
  onChooseTool: (tool: PaintTool) => void;
  onToggleMirror: () => void;
  /** Opens or closes `panel`; `target` receives focus again when the panel closes. */
  onTogglePanel: (panel: PanelId, target: HTMLElement) => void;
}) {
  const hints = createHoverHints<keyof typeof toolHints>();
  // Handlers created once, outside the JSX, so that re-applied attributes keep them.
  const on = Object.fromEntries(Object.keys(toolHints).map((id) => [id, hints.on(id as keyof typeof toolHints)])) as {
    [id in keyof typeof toolHints]: ReturnType<typeof hints.on>;
  };

  return (
    <nav class={styles.tools} aria-label="Drawing tools">
      <For each={toolButtons}>
        {(button) => (
          <button
            aria-label={button.label}
            aria-pressed={props.tool === button.tool ? 'true' : 'false'}
            onClick={() => props.onChooseTool(button.tool)}
            {...on[button.tool]}
          >
            <SketchIcon name={button.icon} />
          </button>
        )}
      </For>
      <button
        aria-label="Transform"
        aria-pressed={props.transforming ? 'true' : 'false'}
        onClick={() => props.onTransform()}
        {...on.transform}
      >
        <SketchIcon name="move" />
      </button>
      <span class={styles.toolSeparator} />
      <button
        aria-label="Mirror canvas"
        aria-pressed={props.mirrored ? 'true' : 'false'}
        onClick={() => props.onToggleMirror()}
        {...on.mirror}
      >
        <SketchIcon name="mirror" />
      </button>
      <button
        aria-label="Paint symmetry"
        aria-pressed={props.symmetry ? 'true' : 'false'}
        aria-expanded={props.panel === 'symmetry' ? 'true' : 'false'}
        aria-controls="paint-panel"
        onClick={(event) => props.onTogglePanel('symmetry', event.currentTarget)}
        {...on.symmetry}
      >
        <SketchIcon name="symmetry" />
      </button>
      <button
        aria-label="Layers"
        aria-expanded={props.panel === 'layers' ? 'true' : 'false'}
        aria-controls="paint-panel"
        onClick={(event) => props.onTogglePanel('layers', event.currentTarget)}
        {...on.layers}
      >
        <SketchIcon name="layers" />
      </button>
      <Show when={hints.shown()}>
        {(shown) => (
          <HintCard
            hint={toolHints[shown().id]}
            style={{
              left: 'calc(100% + 8px)',
              top: `${shown().element.offsetTop + shown().element.offsetHeight / 2}px`,
              transform: 'translateY(-50%)'
            }}
          />
        )}
      </Show>
    </nav>
  );
}

/** Tool buttons in toolbar order; their hints are `toolHints` by the same id. */
const toolButtons = [
  { tool: 'brush', label: 'Brush', icon: 'draw' },
  { tool: 'eraser', label: 'Eraser', icon: 'erase' },
  { tool: 'fill', label: 'Fill', icon: 'fill' },
  { tool: 'gradient', label: 'Gradient', icon: 'gradient' },
  { tool: 'lasso', label: 'Lasso', icon: 'lasso' }
] as const satisfies readonly { tool: PaintTool; label: string; icon: string }[];
