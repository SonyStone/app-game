import { Camera, Orbit, Renderer, Transform, Vec3 } from '@packages/ogl';
import { toRadian } from '@packages/ogl/extras/path/utils';
import { createSkipper } from '@packages/tanki/create-skipper';
import { numberPrecisionDragInput } from '@packages/ui-components-examples/breadcrumbs/number-precision-drag-input';
import createRAF from '@solid-primitives/raf';
import { Index } from 'solid-js';
import { createStore } from 'solid-js/store';
import { effect } from 'solid-js/web';
import { NormalBox } from './camera-projection-webgl2/normal-box.component';
import { GridHelperComponent } from './grid-helper.component';

export default function AffineTransformations3D() {
  const [matrix, setMatrix] = createStore([
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1]
  ]);

  const canvas = (() => {
    const canvas = (<canvas class="w-400px h-400px border-t" />) as HTMLCanvasElement;
    const renderer = new Renderer({ dpr: 2, canvas, height: 400, width: 400 });
    const gl = renderer.gl;
    gl.clearColor(1, 1, 1, 1);

    const camera = new Camera({ fov: 35 });
    camera.position.set(2, 4, 4);
    const controls = new Orbit(camera, { element: canvas, target: new Vec3(1, 1, 0) });

    const scene = new Transform();

    effect(() => {
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    });

    const skipper = createSkipper(100);
    function update(t: number) {
      controls.update();
      renderer.render({ scene, camera });
      // console.log(`camera 3d`, scene, camera);
    }

    const [running, start, stop] = createRAF(update);
    start();

    return { canvas, gl, scene };
  })();

  return (
    <div class="flex flex-col place-items-center">
      <div class="flex flex-col place-items-start border">
        <h1>Affine Transformations 3D</h1>
        <form
          class="contents"
          novalidate
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const angle = parseFloat((form[0] as HTMLInputElement).value);
            const angleInRadians = toRadian(angle);
            const cos = Math.cos(angleInRadians);
            const sin = Math.sin(angleInRadians);
            const m10 = matrix[0][0]; // a
            const m11 = matrix[0][1]; // b

            const m20 = matrix[1][0]; // c
            const m21 = matrix[1][1]; // d

            const m30 = matrix[0][2]; // x
            const m31 = matrix[1][2]; // y

            setMatrix(0, 0, cos * m10 - sin * m11);
            setMatrix(0, 1, sin * m10 + cos * m11);
            setMatrix(1, 0, cos * m20 - sin * m21);
            setMatrix(1, 1, sin * m20 + cos * m21);
          }}
        >
          <input
            id="rotation"
            name="rotation"
            value={30}
            type="number"
            ref={(ref) => {
              numberPrecisionDragInput(ref, {
                value: parseFloat(ref.value),
                onChange: (value) => {
                  ref.value = value.toString();
                }
              });
            }}
          />
        </form>
        <table>
          <tbody>
            <Index each={matrix}>
              {(row, rowIndex) => (
                <tr>
                  <Index each={row()}>
                    {(cell, colIndex) => (
                      <td class="border-e border-t">
                        <input
                          class="w-16"
                          value={cell()}
                          type="number"
                          onInput={(e) => {
                            const value = parseFloat(e.target.value);
                            setMatrix(rowIndex, colIndex, value);
                          }}
                          ref={(ref) => {
                            numberPrecisionDragInput(ref, {
                              value: cell,
                              onChange: (value) => {
                                setMatrix(rowIndex, colIndex, value);
                              }
                            });
                          }}
                        />
                      </td>
                    )}
                  </Index>
                </tr>
              )}
            </Index>
          </tbody>
        </table>
        {canvas.canvas}
        <GridHelperComponent gl={canvas.gl} scene={canvas.scene} />
        <NormalBox gl={canvas.gl} scene={canvas.scene} position={[0.5, 0.5, 0.5]} matrix={matrix} />
      </div>
    </div>
  );
}
