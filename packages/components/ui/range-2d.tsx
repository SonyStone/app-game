import { cn } from '@packages/utils/cn';
import { createElementClientRect } from '@utils/createElementClientRect';
import { createMemo, createSignal, onMount, Show } from 'solid-js';

export interface Range2DProps {
  value: [number, number];
  onInput?: (value: [number, number]) => void;
  onChange?: (value: [number, number]) => void;
  min?: [number, number];
  max?: [number, number];
  step?: [number, number];
  class?: string;
  showGrid?: boolean;
  gridSize?: number;
  dotSize?: number;
}

function createIsMounted() {
  const [isMounted, setIsMounted] = createSignal(false);
  onMount(() => setIsMounted(true));
  return isMounted;
}

/**
 * A 2D range input component that allows dragging a point in a 2D space.
 * Similar to <input type="range"> but for two values (x, y).
 *
 * @example
 * ```tsx
 * const [value, setValue] = createSignal<[number, number]>([0, 0]);
 * <Range2D
 *   value={value()}
 *   onInput={setValue}
 *   min={[-1, -1]}
 *   max={[1, 1]}
 *   showGrid
 * />
 * ```
 */
export function Range2D(props: Range2DProps) {
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
  const [isDragging, setIsDragging] = createSignal(false);
  const rect = createElementClientRect(containerRef);
  const isMounted = createIsMounted();

  const min = () => props.min ?? [0, 0];
  const max = () => props.max ?? [1, 1];
  const step = () => props.step ?? [0.001, 0.001];
  const showGrid = () => props.showGrid ?? true;
  const gridSize = () => props.gridSize ?? 10;
  const dotSize = () => props.dotSize ?? 16;

  // Convert pixel position to value
  const positionToValue = (x: number, y: number): [number, number] => {
    const r = rect();
    if (!r) return props.value;

    const [minX, minY] = min();
    const [maxX, maxY] = max();
    const [stepX, stepY] = step();

    // Get position relative to container
    const relX = Math.max(0, Math.min(r.width, x - r.left));
    const relY = Math.max(0, Math.min(r.height, y - r.top));

    // Normalize to 0-1 range (flip Y)
    const normalizedX = relX / r.width;
    const normalizedY = 1 - relY / r.height;

    // Convert to value range
    let valueX = minX + normalizedX * (maxX - minX);
    let valueY = minY + normalizedY * (maxY - minY);

    // Apply step
    if (stepX > 0) {
      valueX = Math.round(valueX / stepX) * stepX;
    }
    if (stepY > 0) {
      valueY = Math.round(valueY / stepY) * stepY;
    }

    // Clamp to min/max
    valueX = Math.max(minX, Math.min(maxX, valueX));
    valueY = Math.max(minY, Math.min(maxY, valueY));

    return [valueX, valueY];
  };

  const handlePointerDown = (e: PointerEvent) => {
    setIsDragging(true);
    const container = containerRef();
    if (container) {
      container.setPointerCapture(e.pointerId);
    }
    updateValue(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (isDragging()) {
      updateValue(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (isDragging()) {
      setIsDragging(false);
      const container = containerRef();
      if (container) {
        container.releasePointerCapture(e.pointerId);
      }
      updateValue(e.clientX, e.clientY, true);
    }
  };

  const updateValue = (clientX: number, clientY: number, final = false) => {
    const newValue = positionToValue(clientX, clientY);

    if (final) {
      props.onChange?.(newValue);
    } else {
      props.onInput?.(newValue);
    }
  };

  // Generate grid lines
  const gridLines = () => {
    if (!showGrid()) return { vertical: [], horizontal: [] };

    const size = gridSize();
    const vertical: number[] = [];
    const horizontal: number[] = [];

    for (let i = 1; i < size; i++) {
      vertical.push((i / size) * 100);
      horizontal.push((i / size) * 100);
    }

    return { vertical, horizontal };
  };

  // Convert value to pixel position (0-1 normalized to container size)
  const valueToPosition = createMemo((): [number, number] => {
    const r = rect();
    if (!r) return [0, 0];

    const [minX, minY] = min();
    const [maxX, maxY] = max();

    // Normalize value to 0-1 range
    const normalizedX = (props.value[0] - minX) / (maxX - minX);
    const normalizedY = (props.value[1] - minY) / (maxY - minY);

    // Convert to pixel position (flip Y because screen coordinates go down)
    const x = normalizedX * r.width;
    const y = (1 - normalizedY) * r.height;

    return [x, y];
  });

  return (
    <div
      ref={setContainerRef}
      class={cn(`relative h-64 w-64 select-none bg-gray-100`, props.class)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ 'touch-action': 'none', cursor: isDragging() ? 'grabbing' : 'grab' }}
    >
      <Show when={isMounted()}>
        {/* Grid lines */}
        {showGrid() && (
          <>
            {/* Vertical lines */}
            {gridLines().vertical.map((x) => (
              <div class="pointer-events-none absolute h-full w-px bg-gray-300" style={{ left: `${x}%` }} />
            ))}
            {/* Horizontal lines */}
            {gridLines().horizontal.map((y) => (
              <div class="pointer-events-none absolute h-px w-full bg-gray-300" style={{ top: `${y}%` }} />
            ))}
            {/* Center lines (darker) */}
            <div class="pointer-events-none absolute h-full w-px bg-gray-400" style={{ left: '50%' }} />
            <div class="pointer-events-none absolute h-px w-full bg-gray-400" style={{ top: '50%' }} />
          </>
        )}

        {/* Draggable dot */}
        <div
          class="pointer-events-none absolute rounded-full bg-blue-500 shadow-lg ring-2 ring-white"
          style={{
            width: `${dotSize()}px`,
            height: `${dotSize()}px`,
            left: `${valueToPosition()[0]}px`,
            top: `${valueToPosition()[1]}px`,
            transform: 'translate(-50%, -50%)',
            transition: isDragging() ? 'none' : 'left 0.1s, top 0.1s'
          }}
        />

        {/* Value display */}
        <div class="pointer-events-none absolute bottom-1 left-1 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
          x: {props.value[0].toFixed(3)}, y: {props.value[1].toFixed(3)}
        </div>
      </Show>
    </div>
  );
}
