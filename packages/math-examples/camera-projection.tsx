import { Camera, Mat4, Orbit, Transform, Vec3, Vec4 } from '@packages/ogl';
import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { normalize } from '@packages/utils/path-data-parser/normalize';
import { parsePath, serialize } from '@packages/utils/path-data-parser/parser';
import { ComponentProps, Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';

export default function CameraProjection() {
  let svg: SVGSVGElement;

  const [drawPoints, setDrawPoints] = createSignal<Vec4Tuple[]>([]);

  const size = 1;
  const points = [
    new Vec4(0, 0, 0, 1),
    new Vec4(size, 0, 0, 1),
    new Vec4(0, size, 0, 1),
    new Vec4(size, size, 0, 1),
    new Vec4(0, 0, size, 1),
    new Vec4(size, 0, size, 1),
    new Vec4(0, size, size, 1),
    new Vec4(size, size, size, 1)
  ];
  const indexs = [0, 1, 3, 2, 0, 4, 5, 7, 6, 4, 0, 2, 6, 7, 3, 1, 5];

  const [shpaeD, setShapeD] = createSignal<string>('');
  // const shape = normalize(parsePath('M 10,30 A 20,20 0,0,1 50,30 A 20,20 0,0,1 90,30 Q 90,60 50,90 Q 10,60 10,30 z'));
  const shape = normalize(
    parsePath(
      'M11.9994 3V7M11.9994 7V17M11.9994 7L8.99943 4M11.9994 7L14.9994 4M11.9994 17V21M11.9994 17L8.99943 20M11.9994 17L14.9994 20M4.20624 7.49999L7.67034 9.49999M7.67034 9.49999L16.3306 14.5M7.67034 9.49999L3.57227 10.5981M7.67034 9.49999L6.57227 5.40191M16.3306 14.5L19.7947 16.5M16.3306 14.5L17.4287 18.5981M16.3306 14.5L20.4287 13.4019M4.2067 16.5L7.6708 14.5M7.6708 14.5L16.3311 9.49999M7.6708 14.5L3.57273 13.4019M7.6708 14.5L6.57273 18.5981M16.3311 9.49999L19.7952 7.49999M16.3311 9.49999L17.4291 5.40192M16.3311 9.49999L20.4291 10.5981'
    )
  );
  console.log(`shape`, shape);

  onMount(() => {
    const camera = new Camera({ fov: 35, aspect: 400 / 400 });
    camera.position.set(2, 4, 4);
    const controls = new Orbit(camera, { element: svg as any as HTMLElement, target: new Vec3(1, 1, 0) });

    camera.updateMatrixWorld();

    const scene = new Transform();

    let requestID = requestAnimationFrame(update);
    function update(t: number) {
      requestID = requestAnimationFrame(update);

      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      controls.update();
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();

      // projectionMatrix * viewMatrix * worldMatrix * position
      const transformMatrix = new Mat4();
      transformMatrix.multiply(camera.viewMatrix, scene.worldMatrix);
      transformMatrix.multiply(camera.projectionMatrix, transformMatrix);

      const updatedPoints = points.map((point) => {
        const clipSpaceVertex = transformMatrix.multiplyVec4(point, new Vec4());
        clipSpaceVertex.multiply(1 / clipSpaceVertex[3]);
        return clipSpaceVertex;
      });
      setDrawPoints(updatedPoints);

      const transformedShape = shape.map(({ key, data }) => {
        data = data.map((d) => d / 10);
        switch (key) {
          case 'L':
          case 'M': {
            const clipSpaceVertex = transformMatrix.multiplyVec4([data[0], data[1], -1, 1], new Vec4());
            clipSpaceVertex.multiply(1 / clipSpaceVertex[3]);
            return { key, data: [clipSpaceVertex[0], clipSpaceVertex[1]] };
          }
          case 'C': {
            const clipSpaceVertex1 = transformMatrix.multiplyVec4([data[0], data[1], -1, 1], new Vec4());
            clipSpaceVertex1.multiply(1 / clipSpaceVertex1[3]);
            const clipSpaceVertex2 = transformMatrix.multiplyVec4([data[2], data[3], -1, 1], new Vec4());
            clipSpaceVertex2.multiply(1 / clipSpaceVertex2[3]);
            const clipSpaceVertex3 = transformMatrix.multiplyVec4([data[4], data[5], -1, 1], new Vec4());
            clipSpaceVertex3.multiply(1 / clipSpaceVertex3[3]);

            return {
              key,
              data: [
                clipSpaceVertex1[0],
                clipSpaceVertex1[1],
                clipSpaceVertex2[0],
                clipSpaceVertex2[1],
                clipSpaceVertex3[0],
                clipSpaceVertex3[1]
              ]
            };
          }
          default: {
            return { key, data };
          }
        }
      });

      setShapeD(serialize(transformedShape));
    }

    onCleanup(() => {
      cancelAnimationFrame(requestID);
      controls.remove();
    });
  });

  return (
    <div>
      <div>Camera Projection on SVG canvas</div>
      <svg ref={(ref) => (svg = ref)} class="border" height={400} width={400} viewBox="0 0 2 2">
        <g transform="scale(1, -1) translate(1 1)" transform-origin="center">
          <path
            class="text-blueGray"
            d={shpaeD()}
            stroke-width="0.04"
            stroke="currentcolor"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <Index each={drawPoints()}>
            {(point) => <circle class="text-green" fill="currentcolor" cx={point()[0]} cy={point()[1]} r=".02" />}
          </Index>
          <Show when={drawPoints().length > 0}>
            <Polygon vertexs={drawPoints()} indexs={indexs} offset={0} fill="red" />

            <Index each={indexs}>
              {(id, i) => (
                <Show when={!!drawPoints()[indexs[i + 1]]}>
                  <line
                    x1={drawPoints()[id()][0]}
                    y1={drawPoints()[id()][1]}
                    x2={drawPoints()[indexs[i + 1]][0]}
                    y2={drawPoints()[indexs[i + 1]][1]}
                    stroke="black"
                    stroke-width={0.01}
                  />
                </Show>
              )}
            </Index>
          </Show>
        </g>
      </svg>
    </div>
  );
}

const Polygon = (props: { vertexs: number[][]; indexs: number[]; offset: number } & ComponentProps<'polygon'>) => {
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

  return <polygon points={points()} {...props} />;
};
