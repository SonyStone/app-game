import { createSignal, For, Show } from 'solid-js';
import { resolveStop, type GradientStop } from './createGradient';
import styles from './Gradient.module.css';

/**
 * Edits the gradient's color stops: the bar shows the gradient, a press on it adds a stop there, and the markers
 * below it are dragged along it or chosen to edit their color (the foreground or background color, or a fixed one)
 * and opacity, or to delete them; at least two stops stay. Markers follow pen, mouse and touch.
 */
export function GradientStops(props: {
  stops: readonly GradientStop[];
  /** The colors the `foreground` and `background` stops stand for now. */
  colors: { foreground: string; background: string };
  /** Mixes the bar's preview in linear light, as Smooth color. */
  linear: boolean;
  onChange: (stops: GradientStop[]) => void;
}) {
  const [selected, setSelected] = createSignal(0);
  let bar!: HTMLDivElement;
  const current = () => props.stops[Math.min(selected(), props.stops.length - 1)]!;
  const positionAt = (event: PointerEvent) => {
    const box = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  };
  const update = (index: number, patch: Partial<GradientStop>) =>
    props.onChange(props.stops.map((stop, at) => (at === index ? { ...stop, ...patch } : stop)));
  const background = () => {
    const stops = [...props.stops]
      .sort((a, b) => a.position - b.position)
      .map((stop) => `${resolveStop(stop.color, props.colors)}${alphaHex(stop.alpha)} ${stop.position * 100}%`);
    return `linear-gradient(${props.linear ? 'in srgb-linear ' : ''}to right, ${stops.join(', ')})`;
  };

  return (
    <div class={styles.stops}>
      <div
        ref={bar}
        class={styles.bar}
        role="button"
        aria-label="Add a color stop"
        onPointerDown={(event) => {
          if (props.stops.length >= 16) {
            return;
          }

          // A new stop takes the color of the nearest stop and the opacity between its neighbors.
          const position = positionAt(event);
          const nearest = [...props.stops].sort(
            (a, b) => Math.abs(a.position - position) - Math.abs(b.position - position)
          )[0]!;
          props.onChange([...props.stops, { ...nearest, position }]);
          setSelected(props.stops.length);
        }}
      >
        <div style={{ background: background() }} />
      </div>
      <div class={styles.markers}>
        <For each={props.stops}>
          {(stop, index) => (
            <button
              class={styles.marker}
              aria-label={`Color stop at ${Math.round(stop.position * 100)}%`}
              aria-pressed={index() === selected() ? 'true' : 'false'}
              style={{ left: `${stop.position * 100}%`, '--stop': resolveStop(stop.color, props.colors) }}
              onPointerDown={(event) => {
                event.preventDefault();
                setSelected(index());
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  update(index(), { position: positionAt(event) });
                }
              }}
            />
          )}
        </For>
      </div>
      <div class={styles.stopFields}>
        <select
          aria-label="Stop color"
          value={current().color === 'foreground' || current().color === 'background' ? current().color : 'custom'}
          onChange={(event) => {
            const value = event.currentTarget.value;
            update(selected(), {
              color: value === 'custom' ? resolveStop(current().color, props.colors) : value
            });
          }}
        >
          <option value="foreground">Foreground</option>
          <option value="background">Background</option>
          <option value="custom">Fixed color</option>
        </select>
        <Show when={current().color !== 'foreground' && current().color !== 'background'}>
          <input
            aria-label="Stop hex color"
            type="color"
            value={current().color}
            onInput={(event) => update(selected(), { color: event.currentTarget.value })}
          />
        </Show>
        <label>
          <span>{Math.round(current().alpha * 100)}%</span>
          <input
            aria-label="Stop opacity"
            type="range"
            min={0}
            max={100}
            value={Math.round(current().alpha * 100)}
            onInput={(event) => update(selected(), { alpha: event.currentTarget.valueAsNumber / 100 })}
          />
        </label>
        <button
          aria-label="Delete color stop"
          disabled={props.stops.length <= 2}
          onClick={() => {
            props.onChange(props.stops.filter((_, index) => index !== selected()));
            setSelected(0);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** Two hex digits of an opacity from 0 to 1. */
function alphaHex(alpha: number) {
  return Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
}
