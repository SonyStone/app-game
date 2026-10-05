import { toRadian } from '@app-game/ogl/extras/path/utils';
import {
  NumberPrecisionDragButton,
  numberPrecisionDragInput
} from '@app-game/ui-components-examples/breadcrumbs/number-precision-drag-input';
import { For, createMemo, createStore } from 'solid-js';

export default function AffineTransformations() {
  const [matrix, setMatrix] = createStore([
    [6, 0, 2],
    [0, 6, 2],
    [0, 0, 1]
  ]);

  // The rotation field is uncontrolled: the form reads it on submit, so drags write straight to the element.
  let rotation!: HTMLInputElement;
  const readRotation = () => parseFloat(rotation.value);
  const writeRotation = (value: number) => {
    rotation.value = value.toString();
  };

  const green = createMemo(() => [matrix[0][2], matrix[1][2]]);
  const red = createMemo(() => [
    (matrix[0][1] + matrix[0][2]) / (matrix[2][1] + 1),
    (matrix[1][1] + matrix[1][2]) / (matrix[2][1] + 1)
  ]);
  const blue = createMemo(() => [
    (matrix[0][0] + matrix[0][2]) / (matrix[2][0] + 1),
    (matrix[1][0] + matrix[1][2]) / (matrix[2][0] + 1)
  ]);
  const purple = createMemo(() => [
    (matrix[0][0] + matrix[0][1] + matrix[0][2]) / (matrix[2][0] + matrix[2][1] + 1),
    (matrix[1][0] + matrix[1][1] + matrix[1][2]) / (matrix[2][0] + matrix[2][1] + 1)
  ]);

  return (
    <div class="flex flex-col place-items-center">
      <div class="flex flex-col place-items-start border">
        <h1>Affine Transformations</h1>
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
            // setMatrix(0, 2, cos * m30 - sin * m31);
            // setMatrix(1, 2, sin * m30 + cos * m31);
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
        <svg class="border-t" height={400} width={400} viewBox="0 0 50 50">
          <g transform="scale(1, -1) translate(25 25)" transform-origin="center">
            <line x1="0" y1="0" x2="40" y2="0" stroke="black" stroke-width="0.1" />
            <line x1="0" y1="0" x2="0" y2="40" stroke="black" stroke-width="0.1" />
            <line
              x1="0"
              y1="0"
              x2={green()[0]}
              y2={green()[1]}
              stroke-dasharray="0.4"
              stroke="black"
              stroke-width="0.1"
            />
            <line x1="0" y1="0" x2={red()[0]} y2={red()[1]} stroke-dasharray="0.4" stroke="black" stroke-width="0.1" />
            <line
              x1="0"
              y1="0"
              x2={blue()[0]}
              y2={blue()[1]}
              stroke-dasharray="0.4"
              stroke="black"
              stroke-width="0.1"
            />
            <line
              x1="0"
              y1="0"
              x2={purple()[0]}
              y2={purple()[1]}
              stroke-dasharray="0.4"
              stroke="black"
              stroke-width="0.1"
            />
            <line x1={green()[0]} y1={green()[1]} x2={red()[0]} y2={red()[1]} stroke="black" stroke-width="0.1" />
            <line x1={red()[0]} y1={red()[1]} x2={purple()[0]} y2={purple()[1]} stroke="black" stroke-width="0.1" />
            <line x1={purple()[0]} y1={purple()[1]} x2={blue()[0]} y2={blue()[1]} stroke="black" stroke-width="0.1" />
            <line x1={blue()[0]} y1={blue()[1]} x2={green()[0]} y2={green()[1]} stroke="black" stroke-width="0.1" />
            <circle class="text-green" fill="currentcolor" cx={green()[0]} cy={green()[1]} r=".8" />
            <circle class="text-red" fill="currentcolor" cx={red()[0]} cy={red()[1]} r=".8" />
            <circle class="text-blue" fill="currentcolor" cx={blue()[0]} cy={blue()[1]} r=".8" />
            <circle class="text-purple" fill="currentcolor" cx={purple()[0]} cy={purple()[1]} r=".8" />
            <g
              transform={`matrix(${matrix[0][0]} ${matrix[1][0]} ${matrix[0][1]} ${matrix[1][1]} ${matrix[0][2]} ${matrix[1][2]})`}
            >
              <text x={0} y={0} font-size="2" class="text-green">
                asd
              </text>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
