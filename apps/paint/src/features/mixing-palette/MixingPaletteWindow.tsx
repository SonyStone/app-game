import { Errored, For } from 'solid-js';
import { FloatingWindow } from '../../shared/ui/FloatingWindow';
import type { createRecentColors } from '../color/createRecentColors';
import { createMixingPalette } from './createMixingPalette';
import { MixingPalette } from './MixingPalette';
import styles from './MixingPaletteWindow.module.css';

/**
 * The mixing palette as a floating window over any variant: the palette with its paint tubes (see `MixingPalette`),
 * then the brush's color and the colors loaded lately, which load the brush again. The paint is read when the window
 * opens and saved when it closes; see `createMixingPalette`.
 */
export function MixingPaletteWindow(props: {
  position: { x: number; y: number };
  onMove: (position: { x: number; y: number }, done: boolean) => void;
  onClose: () => void;
  /** The brush's color. */
  color: string;
  /** The session's shared history; this window never creates a second persisted list. */
  recentColors: ReturnType<typeof createRecentColors>;
  /** Loads the brush with `color`, picked from the palette or the loaded colors. */
  onLoad: (color: string) => void;
}) {
  const palette = createMixingPalette();
  const recentColors = props.recentColors;
  const load = (color: string) => {
    recentColors.remember(color);
    props.onLoad(color);
  };

  return (
    <FloatingWindow
      title="Mixing palette"
      width={296}
      position={props.position}
      onMove={props.onMove}
      onClose={props.onClose}
    >
      <div class={styles.body}>
        <Errored fallback={<p class={styles.failed}>The palette failed to open.</p>}>
          <MixingPalette palette={palette} color={props.color} onLoad={load} />
        </Errored>
        <div class={styles.loaded} role="group" aria-label="Loaded colors">
          <span class={styles.current} style={{ background: props.color }} title={`Brush color ${props.color}`} />
          <For each={recentColors.colors().slice(0, 7)}>
            {(color) => (
              <button
                class={styles.swatch}
                style={{ background: color }}
                aria-label={`Load ${color}`}
                title={`Load ${color}`}
                onClick={() => load(color)}
              />
            )}
          </For>
        </div>
      </div>
    </FloatingWindow>
  );
}
