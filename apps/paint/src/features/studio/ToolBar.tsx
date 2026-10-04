import { createSignal, For, onCleanup, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { PaintTool } from '../brush';
import styles from './PaintStudio.module.css';
import type { PanelId } from './StudioPanel';
import { ToolHint, toolHints } from './ToolHint';

/**
 * Left tool rail: drawing tools and the transform, then the view mirror and the symmetry and layer panel toggles. A pen
 * or mouse resting on a button shows its visual hint beside the rail; see `ToolHint`.
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
  const hints = createHints();

  return (
    <nav class={styles.tools} aria-label="Drawing tools">
      <For each={toolButtons}>
        {(button) => (
          <button
            aria-label={button.label}
            aria-pressed={props.tool === button.tool ? 'true' : 'false'}
            onClick={() => props.onChooseTool(button.tool)}
            {...hints.on[button.tool]}
          >
            <SketchIcon name={button.icon} />
          </button>
        )}
      </For>
      <button
        aria-label="Transform"
        aria-pressed={props.transforming ? 'true' : 'false'}
        onClick={() => props.onTransform()}
        {...hints.on.transform}
      >
        <SketchIcon name="move" />
      </button>
      <span class={styles.toolSeparator} />
      <button
        aria-label="Mirror canvas"
        aria-pressed={props.mirrored ? 'true' : 'false'}
        onClick={() => props.onToggleMirror()}
        {...hints.on.mirror}
      >
        <SketchIcon name="mirror" />
      </button>
      <button
        aria-label="Paint symmetry"
        aria-pressed={props.symmetry ? 'true' : 'false'}
        aria-expanded={props.panel === 'symmetry' ? 'true' : 'false'}
        aria-controls="paint-panel"
        onClick={(event) => props.onTogglePanel('symmetry', event.currentTarget)}
        {...hints.on.symmetry}
      >
        <SketchIcon name="symmetry" />
      </button>
      <button
        aria-label="Layers"
        aria-expanded={props.panel === 'layers' ? 'true' : 'false'}
        aria-controls="paint-panel"
        onClick={(event) => props.onTogglePanel('layers', event.currentTarget)}
        {...hints.on.layers}
      >
        <SketchIcon name="layers" />
      </button>
      <Show when={hints.shown()}>{(shown) => <ToolHint hint={toolHints[shown().id]} top={shown().top} />}</Show>
    </nav>
  );
}

/**
 * Which hint shows: a pen or mouse resting 400 ms on a button shows its hint, moving on to the next button within a
 * moment shows that one at once, and leaving or pressing hides it. Touch shows none. `on` holds each button's pointer
 * handlers, created once, outside the JSX, so that re-applied attributes keep them.
 */
function createHints() {
  const [shown, setShown] = createSignal<{ id: keyof typeof toolHints; top: number }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When the last hint hid, so that the next button's shows without waiting. */
  let hidden = -Infinity;
  const hide = () => {
    clearTimeout(timer);
    if (shown()) {
      hidden = performance.now();
      setShown(undefined);
    }
  };
  onCleanup(() => clearTimeout(timer));
  const handlers = (id: keyof typeof toolHints) => ({
    onPointerEnter(event: PointerEvent & { currentTarget: HTMLElement }) {
      if (event.pointerType === 'touch') {
        return;
      }

      const button = event.currentTarget;
      clearTimeout(timer);
      timer = setTimeout(
        () => setShown({ id, top: button.offsetTop + button.offsetHeight / 2 }),
        performance.now() - hidden < 300 ? 0 : 400
      );
    },
    onPointerLeave: hide,
    onPointerDown: hide
  });
  const on = Object.fromEntries(Object.keys(toolHints).map((id) => [id, handlers(id as keyof typeof toolHints)])) as {
    [id in keyof typeof toolHints]: ReturnType<typeof handlers>;
  };

  return { shown, on };
}

/** Tool buttons in toolbar order; their hints are `toolHints` by the same id. */
const toolButtons = [
  { tool: 'brush', label: 'Brush', icon: 'draw' },
  { tool: 'eraser', label: 'Eraser', icon: 'erase' },
  { tool: 'fill', label: 'Fill', icon: 'fill' },
  { tool: 'gradient', label: 'Gradient', icon: 'gradient' },
  { tool: 'lasso', label: 'Lasso', icon: 'lasso' }
] as const satisfies readonly { tool: PaintTool; label: string; icon: string }[];
