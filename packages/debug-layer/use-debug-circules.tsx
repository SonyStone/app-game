import { NumberArray } from '@app-game/math/utils/typed-array';
import { getRandomFromList } from '@app-game/utils/get-random-from-list';
import { createRoot } from 'solid-js';
import { colors } from './colors';
import type { DebugElement } from './use-debug-layer';

export function useDebugCircules({
  activeElements,
  addElement,
  theme = 'light'
}: {
  theme?: 'light' | 'dark';
  activeElements: Map<string, DebugElement>;
  addElement: (id: string, element: SVGElement) => void;
}) {
  // Update or create a tracked debug point with specific ID
  const updateCircule = (id: string, point: NumberArray, color = getRandomFromList(colors[theme]), size = 20) => {
    const data = activeElements.get(id);

    if (!data) {
      const transform = { transform: `translate(${point[0]}px, ${point[1]}px)` };

      createRoot((dispose) => {
        const element = (
          <g class="pointer-events-none select-none" style={transform}>
            <circle cx={0} cy={0} r={size} stroke={color} fill="none" stroke-width={1} />
            <text text-anchor="middle" alignment-baseline="middle" font-size="12" fill={color}>
              {id}
            </text>
            <path
              d={`M ${-size / 2} ${-size / 2} L ${size / 2} ${size / 2} M ${size / 2} ${-size / 2} L ${-size / 2} ${
                size / 2
              }`}
              fill="none"
              stroke={color}
              stroke-width="1"
              stroke-dasharray="3"
            />
          </g>
        ) as SVGElement;
        addElement(id, element);
        dispose();
      });
    } else {
      const element = data.element;
      element.setAttribute('style', `transform: translate(${point[0]}px, ${point[1]}px)`);

      data.animation.currentTime = 0;
    }
  };

  return {
    updateCircule
  };
}
