import { NumberArray } from '@app-game/math/utils/typed-array';
import { getRandomFromList } from '@app-game/utils/get-random-from-list';
import { createRoot, getOwner } from 'solid-js';
import { colors } from './colors';
import type { DebugElement } from './use-debug-layer';
import { fadeOut } from './fade-out';

export function useDebugAngle({
  activeElements,
  addElement,
  theme = 'light'
}: {
  theme?: keyof typeof colors;
  activeElements: Map<string, DebugElement>;
  addElement: (id: string, element: SVGElement) => void;
}) {
  const owner = getOwner()
  // Update or create a tracked debug point with specific ID
  const updateAngle = (
    id: string,
    point1: Readonly<NumberArray>,
    point2: Readonly<NumberArray>,
    point3: Readonly<NumberArray>,
    color = getRandomFromList(colors[theme]),
    size = 2
  ) => {
    const data = activeElements.get(id);

    if (!data) {
      createRoot((dispose) => {
        const element = (
          <DrawAngle point1={point1} point2={point2} point3={point3} color={color} size={size} />
        ) as SVGElement;

        addElement(id, element);
        dispose();
      }, owner);
    } else {
      const element = data.element;
      element.setAttribute('x1', point1[0].toString());
      element.setAttribute('y1', point1[1].toString());
      element.setAttribute('x2', point2[0].toString());
      element.setAttribute('y2', point2[1].toString());

      data.animation.currentTime = 0;
    }
  };

  return {
    updateLine: updateAngle
  };
}

function DrawAngle(props: {
  point1: Readonly<NumberArray>;
  point2: Readonly<NumberArray>;
  point3: Readonly<NumberArray>;
  size: number;
  color: string;
  onRemove?: () => void;
}) {

  const element= (
    <g>
      <line
        class="pointer-events-none"
        x1={props.point1[0]}
        y1={props.point1[1]}
        x2={props.point2[0]}
        y2={props.point2[1]}
        stroke={props.color}
        stroke-width={props.size}
      />
      <line
        class="pointer-events-none"
        x1={props.point2[0]}
        y1={props.point2[1]}
        x2={props.point3[0]}
        y2={props.point3[1]}
        stroke={props.color}
        stroke-width={props.size}
      />
    </g>
  ) as SVGElement;
  const animation = fadeOut(element);
  animation.finished.then(props.onRemove);

  return element;
}
