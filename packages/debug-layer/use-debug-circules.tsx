import { Vec2Tuple } from '@packages/math-2/v2';
import { getRandomValueFromList } from '@packages/utils/get-random-from-list';
import { createRoot } from 'solid-js';
import type { DebugElement } from './use-debug-layer';

const colors = {
  light: [
    '#264653', // Dark Cyan
    '#2A9D8F', // Teal
    '#E76F51', // Red-Orange
    '#D62828', // Red
    '#457B9D', // Steel Blue
    '#1D3557', // Prussian Blue
    '#000000', // Black
    '#222222', // Very dark gray
    '#333333', // Dark gray
    '#444444' // Medium-dark gray
  ],
  dark: [
    '#F1FAEE', // Beige
    '#A8DADC', // Light Blue
    '#FFFFFF', // White
    '#EEEEEE', // Very light gray
    '#DDDDDD', // Light gray
    '#CED4DA', // Silver
    '#ADB5BD', // Light Gray
    '#6C757D', // Gray
    '#007BFF', // Blue
    '#E9C46A' // Yellow
  ]
};

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
  const updateCircule = (id: string, point: Vec2Tuple, color = getRandomValueFromList(colors[theme]), size = 20) => {
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
