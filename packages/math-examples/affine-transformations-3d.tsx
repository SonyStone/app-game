import { Camera, Orbit, Renderer, Transform, Vec3 } from '@app-game/ogl';
import { toRadian } from '@app-game/ogl/extras/path/utils';
import {
  NumberPrecisionDragButton,
  numberPrecisionDragInput
} from '@app-game/ui-components-examples/breadcrumbs/number-precision-drag-input';
import createRAF from '@solid-primitives/raf';
import { createStore, createTrackedEffect, For, onCleanup, untrack } from 'solid-js';

import { NormalBox } from './camera-projection-webgl2/normal-box.component';
import { GridHelperComponent } from './grid-helper.component';

export default function AffineTransformations3D() {
  const [matrix, setMatrix] = createStore([
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1]
  ]);

  // The rotation field is uncontrolled: the form reads it on submit, so drags write straight to the element.
  let rotation!: HTMLInputElement;
  const readRotation = () => parseFloat(rotation.value);
  const writeRotation = (value: number) => {
    rotation.value = value.toString();
  };

  const canvas = (() => {
    const canvas = (<canvas class="w-400px h-400px border-t" />) as HTMLCanvasElement;
    const renderer = new Renderer({ dpr: 2, canvas, height: 400, width: 400 });
    const gl = renderer.gl;
    gl.clearColor(1, 1, 1, 1);

    const camera = new Camera({ fov: 35 });
    camera.position.set(2, 4, 4);
    const controls = new Orbit(camera, { element: canvas as unknown as HTMLElement, target: new Vec3(1, 1, 0) });

    const scene = new Transform();

    createTrackedEffect(() => {
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    });

    function update(t: number) {
      controls.update();
      renderer.render({ scene, camera });
      // console.log(`camera 3d`, scene, camera);
    }

    const [, start, stop] = createRAF(update);
    untrack(start);
    onCleanup(stop);

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

            setMatrix((draft) => {
              draft[0][0] = cos * m10 - sin * m11;
              draft[0][1] = sin * m10 + cos * m11;
              draft[1][0] = cos * m20 - sin * m21;
              draft[1][1] = sin * m20 + cos * m21;
            });
          }}
        >
          <div class="flex items-center">
            <input
              id="rotation"
              name="rotation"
              value={30}
              type="number"
              ref={(ref) => {
                rotation = ref;
                numberPrecisionDragInput(ref, { value: readRotation, onChange: writeRotation });
              }}
            />
            <NumberPrecisionDragButton value={readRotation} onChange={writeRotation} />
          </div>
        </form>
        <table>
          <tbody>
            <For keyed={false} each={matrix}>
              {(row, rowIndex) => (
                <tr>
                  <For keyed={false} each={row()}>
                    {(cell, colIndex) => {
                      const setCell = (value: number) => {
                        setMatrix((draft) => {
                          draft[rowIndex][colIndex] = value;
                        });
                      };

                      return (
                        <td class="border-e border-t">
                          <div class="flex items-center">
                            <input
                              class="w-16"
                              value={cell()}
                              type="number"
                              onInput={(e) => setCell(parseFloat(e.target.value))}
                              ref={(ref) => {
                                numberPrecisionDragInput(ref, { value: cell, onChange: setCell });
                              }}
                            />
                            <NumberPrecisionDragButton value={cell} onChange={setCell} />
                          </div>
                        </td>
                      );
                    }}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        {canvas.canvas}
        <GridHelperComponent gl={canvas.gl} scene={canvas.scene} />
        <NormalBox gl={canvas.gl} scene={canvas.scene} position={[0.5, 0.5, 0.5]} matrix={matrix} />
      </div>
    </div>
  );
}
