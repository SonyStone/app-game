import type { Hint } from '../../shared/ui/HintCard';
import { hintDemo } from '../../shared/ui/HintCard';

/** Hints of the toolbar buttons, by button; see `HintCard`. */
export const toolHints = {
  brush: {
    title: 'Brush',
    shortcut: 'B',
    description: 'Paints with the chosen preset; pen pressure sets size and flow.',
    demo: () => <path class={hintDemo.draw} d="M10 52c14-30 28-30 40-8s26 22 38-6 18-14 22-10" />
  },
  eraser: {
    title: 'Eraser',
    shortcut: 'E',
    description: 'Erases with the brush shape, or with its own eraser preset.',
    demo: () => (
      <>
        <path class={hintDemo.ink} d="M10 36h100" />
        <path class={hintDemo.erase} d="M60 10v52" />
      </>
    )
  },
  lasso: {
    title: 'Selection',
    shortcut: 'L',
    description: 'Select pixels with a lasso, rectangle or ellipse; brushes, the fill and the gradient then stay inside.',
    demo: () => <path class={hintDemo.dashed} d="M30 18c20-12 62-8 66 12s-26 32-50 26-36-26-16-38Z" />
  },
  transform: {
    title: 'Transform',
    shortcut: '⌘/Ctrl T',
    description: 'Move, scale, turn, distort or warp the selection or the whole layer.',
    demo: () => (
      <g class={hintDemo.turn}>
        <path class={hintDemo.ink} d="M44 28h32v16H44Z" />
        <path class={hintDemo.outline} d="M40 24h40v24H40Z" />
      </g>
    )
  },
  mirror: {
    title: 'Mirror view',
    description: 'Flips the view to check proportions; the drawing itself is unchanged.',
    demo: () => (
      <g class={hintDemo.flip}>
        <path class={hintDemo.ink} d="M40 56c0-24 10-40 30-40-6 8-8 18-4 26" />
      </g>
    )
  },
  symmetry: {
    title: 'Paint symmetry',
    description: 'Every stroke is repeated in mirror or around a center.',
    demo: () => (
      <>
        <path class={hintDemo.axis} d="M60 6v60" />
        <path class={hintDemo.draw} d="M54 56c-18-6-30-22-22-40" />
        <path class={hintDemo.draw} d="M66 56c18-6 30-22 22-40" />
      </>
    )
  },
  layers: {
    title: 'Layers',
    description: 'Layers and frames: order, blend modes, opacity, locks and clipping.',
    demo: () => (
      <g class={hintDemo.lift}>
        <path d="m60 46 36 10-36 10-36-10Z" />
        <path d="m60 32 36 10-36 10-36-10Z" />
        <path d="m60 18 36 10-36 10-36-10Z" />
      </g>
    )
  }
} as const satisfies Record<string, Hint>;
