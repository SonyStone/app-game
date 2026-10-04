import { TILE_SIZE } from '@app-game/paint-core/brush';
import type { BlendMode } from '@app-game/paint-core/document';
import { For, onSettled } from 'solid-js';
import { blendPreview } from './blendPreview';
import styles from './LayersPanel.module.css';

/**
 * The layer blend modes as buttons showing what each does to two overlapping circles, rendered with the same
 * composite as the canvas, so that a mode can be chosen by its look rather than its name.
 */
export function BlendModePicker(props: { mode: BlendMode; onChange: (mode: BlendMode) => void }) {
  return (
    <div class={styles.blendModes} role="radiogroup" aria-label="Layer blend mode">
      <For each={modes}>
        {(mode) => (
          <button
            role="radio"
            aria-checked={props.mode === mode.id ? 'true' : 'false'}
            aria-label={mode.name}
            title={mode.description}
            onClick={() => props.onChange(mode.id)}
          >
            <Preview mode={mode.id} />
            <span>{mode.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}

/** One mode's preview, drawn once into a canvas. */
function Preview(props: { mode: BlendMode }) {
  let canvas!: HTMLCanvasElement;
  onSettled(() => {
    canvas.getContext('2d')?.putImageData(new ImageData(blendPreview(props.mode), TILE_SIZE, TILE_SIZE), 0, 0);
  });

  return <canvas ref={canvas} width={TILE_SIZE} height={TILE_SIZE} aria-hidden="true" />;
}

/** Modes in menu order, with short labels for the buttons. */
const modes = [
  {
    id: 'linear',
    label: 'Smooth',
    name: 'Smooth color',
    description: 'Smooth color: mixes in linear light, without dark edges'
  },
  {
    id: 'normal',
    label: 'Normal',
    name: 'Normal (classic)',
    description: 'Normal: the classic blend of encoded colors'
  },
  {
    id: 'multiply',
    label: 'Multiply',
    name: 'Multiply',
    description: 'Multiply: darkens, like layered transparent ink'
  },
  { id: 'screen', label: 'Screen', name: 'Screen', description: 'Screen: lightens, like projected light' },
  {
    id: 'overlay',
    label: 'Overlay',
    name: 'Overlay',
    description: 'Overlay: raises contrast, darkening darks and lightening lights'
  }
] as const satisfies readonly { id: BlendMode; label: string; name: string; description: string }[];
