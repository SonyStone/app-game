import type { JSX } from '@solidjs/web';
import styles from './ToolHint.module.css';

/**
 * A visual tooltip for a toolbar button: its name and shortcut, what it does in one line, and a small looping
 * demonstration of it, so a tool can be understood before it is tried. Placed beside the toolbar at `top`, the
 * vertical center of the button in CSS pixels of the toolbar. Animations stop for reduced motion.
 */
export function ToolHint(props: { hint: Hint; top: number }) {
  return (
    <div class={styles.hint} role="tooltip" style={{ top: `${props.top}px` }}>
      <svg class={styles.demo} viewBox="0 0 120 72" aria-hidden="true">
        {props.hint.demo()}
      </svg>
      <div class={styles.text}>
        <strong>
          {props.hint.title}
          {props.hint.shortcut && <kbd>{props.hint.shortcut}</kbd>}
        </strong>
        <span>{props.hint.description}</span>
      </div>
    </div>
  );
}

/** What a toolbar button's hint shows; `demo` draws into a 120 × 72 view box. */
export type Hint = { title: string; shortcut?: string; description: string; demo: () => JSX.Element };

/** Hints of the toolbar buttons, by button. */
export const toolHints = {
  brush: {
    title: 'Brush',
    shortcut: 'B',
    description: 'Paints with the chosen preset; pen pressure sets size and flow.',
    demo: () => <path class={styles.draw} d="M10 52c14-30 28-30 40-8s26 22 38-6 18-14 22-10" />
  },
  eraser: {
    title: 'Eraser',
    shortcut: 'E',
    description: 'Erases with the brush shape, or with its own eraser preset.',
    demo: () => (
      <>
        <path class={styles.ink} d="M10 36h100" />
        <path class={styles.erase} d="M60 10v52" />
      </>
    )
  },
  fill: {
    title: 'Fill',
    shortcut: 'G',
    description: 'Fills the area of similar color around a click, closing small gaps in line art.',
    demo: () => (
      <>
        <path class={styles.fillArea} d="M22 14h76v44H22Z" />
        <path class={styles.outline} d="M22 14h76v44H22Z" />
        <circle class={styles.click} cx="60" cy="36" r="4" />
      </>
    )
  },
  gradient: {
    title: 'Gradient',
    description: 'Drag from where the gradient starts to where it ends: linear, radial, angle or diamond.',
    demo: () => (
      <>
        <defs>
          <linearGradient id="tool-hint-gradient">
            <stop offset="0" stop-color="#2f4b62" />
            <stop offset="1" stop-color="#f3efe6" />
          </linearGradient>
        </defs>
        <path class={styles.gradientArea} d="M10 10h100v52H10Z" fill="url(#tool-hint-gradient)" />
        <path class={styles.drag} d="M24 36h72" />
      </>
    )
  },
  lasso: {
    title: 'Lasso',
    shortcut: 'L',
    description: 'Draw around pixels to select them; fills and gradients then stay inside.',
    demo: () => <path class={styles.lasso} d="M30 18c20-12 62-8 66 12s-26 32-50 26-36-26-16-38Z" />
  },
  transform: {
    title: 'Transform',
    shortcut: '⌘/Ctrl T',
    description: 'Move, scale, turn, distort or warp the selection or the whole layer.',
    demo: () => (
      <g class={styles.transform}>
        <path class={styles.ink} d="M44 28h32v16H44Z" />
        <path class={styles.outline} d="M40 24h40v24H40Z" />
      </g>
    )
  },
  mirror: {
    title: 'Mirror view',
    description: 'Flips the view to check proportions; the drawing itself is unchanged.',
    demo: () => (
      <g class={styles.mirror}>
        <path class={styles.ink} d="M40 56c0-24 10-40 30-40-6 8-8 18-4 26" />
      </g>
    )
  },
  symmetry: {
    title: 'Paint symmetry',
    description: 'Every stroke is repeated in mirror or around a center.',
    demo: () => (
      <>
        <path class={styles.axis} d="M60 6v60" />
        <path class={styles.draw} d="M54 56c-18-6-30-22-22-40" />
        <path class={styles.draw} d="M66 56c18-6 30-22 22-40" />
      </>
    )
  },
  layers: {
    title: 'Layers',
    description: 'Layers and frames: order, blend modes, opacity, locks and clipping.',
    demo: () => (
      <g class={styles.layers}>
        <path d="m60 46 36 10-36 10-36-10Z" />
        <path d="m60 32 36 10-36 10-36-10Z" />
        <path d="m60 18 36 10-36 10-36-10Z" />
      </g>
    )
  }
} as const satisfies Record<string, Hint>;
