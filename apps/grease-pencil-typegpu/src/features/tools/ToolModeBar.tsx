import { For } from 'solid-js';
import styles from './ToolModeBar.module.css';
import { SketchIcon } from '../../shared/SketchIcon';
import { toolModeOptions, type ToolMode } from '../../shared/toolMode';
import type { ViewportMode } from '../../shared/viewportMode';

type ToolModeBarProps = {
  viewportMode: ViewportMode;
  mode: ToolMode;
  onSetMode: (mode: ToolMode) => void;
};

/** Compact icon palette; tool names remain available to assistive technology and tooltips. */
export function ToolModeBar(props: ToolModeBarProps) {
  return (
    <nav class={styles.toolRail} aria-label="Drawing tools">
      <For each={toolModeOptions}>
        {(option) => (
          <button
            class={`${styles.toolButton} ${props.mode === option.mode ? styles.toolButtonActive : ''}`}
            type="button"
            onClick={() => props.onSetMode(option.mode)}
            title={option.mode === 'orbit' && props.viewportMode === '2d' ? 'Rotate canvas' : option.title}
            aria-label={option.mode === 'orbit' && props.viewportMode === '2d' ? 'Rotate' : option.label}
            aria-pressed={props.mode === option.mode ? 'true' : 'false'}
          >
            <SketchIcon name={option.mode} />
          </button>
        )}
      </For>
    </nav>
  );
}
