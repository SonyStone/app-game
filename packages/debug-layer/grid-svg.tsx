import { createMemo, mergeProps } from 'solid-js';

export function GridSVG(props: { color?: string; size?: number } = {}) {
  const merged = mergeProps({ color: 'red', size: 10 }, props);

  const path = createMemo(() => {
    return Array.from({ length: merged.size }, (_, i) => i)
      .map((i) => `M 0 ${i * 10} L 100 ${i * 10} M ${i * 10} 0 L ${i * 10} 100`)
      .join(' ');
  });

  return (
    <>
      <path class="pointer-events-none" d={path()} stroke={merged.color} stroke-width={0.1} fill="none" />
      <line class="pointer-events-none" x1={0} y1={0} x2={100} y2={0} stroke-width={0.4} stroke="red"></line>
      <text class="pointer-events-none select-none" x={92} y={0} dy={-4} font-size="12" fill="red">
        x
      </text>
      <line class="pointer-events-none" x1={0} y1={0} x2={0} y2={100} stroke-width={0.4} stroke="green"></line>
      <text class="pointer-events-none select-none" x={0} y={100} dx={-8} font-size="12" fill="green">
        y
      </text>
    </>
  );
}
