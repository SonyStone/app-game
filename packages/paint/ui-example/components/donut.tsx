import { ComponentProps, createMemo } from 'solid-js';

export const Donut = (
  props: { x: number; y: number; inner_radius: number; outer_radius: number } & ComponentProps<'path'>
) => {
  const x1 = createMemo(() => props.x - props.outer_radius);
  const x2 = createMemo(() => props.x + props.outer_radius);
  const x3 = createMemo(() => props.x - props.inner_radius);
  const x4 = createMemo(() => props.x + props.inner_radius);

  return (
    <path
      {...props}
      d={`M ${x1()},${props.y}
          A 5 5 10 0 1 ${x2()},${props.y}
          A 5 5 10 0 1 ${x1()},${props.y}
          M ${x3()},${props.y}
          A 5 5 10 0 0 ${x4()},${props.y}
          A 5 5 10 0 0 ${x3()},${props.y}
          z`}
    />
  );
};
