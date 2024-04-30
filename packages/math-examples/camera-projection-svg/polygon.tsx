import { ComponentProps, createMemo } from 'solid-js';

export const Polygon = (
  props: { vertexs: number[][]; indexs: number[]; offset: number } & ComponentProps<'polygon'>
) => {
  const points = createMemo(() => {
    const vertexs = props.vertexs;
    const indexs = props.indexs;
    const offset = props.offset;

    const points = [
      [vertexs[indexs[0]][0], vertexs[indexs[offset]][1]],
      [vertexs[indexs[offset + 1]][0], vertexs[indexs[offset + 1]][1]],
      [vertexs[indexs[offset + 2]][0], vertexs[indexs[offset + 2]][1]],
      [vertexs[indexs[offset + 3]][0], vertexs[indexs[offset + 3]][1]]
    ];

    return points.join(' ');
  });

  return <polygon points={points()} attr:data-z={props.vertexs[props.indexs[0]][2]} {...props} />;
};
