import { drawPerformancePanel } from '@app-game/solid-gpu/performance/drawPerformancePanel';
import { layoutPerformancePanel, performancePanelSize } from '@app-game/solid-gpu/performance/layoutPerformancePanel';
import type { FrameCostSample } from '@app-game/solid-gpu/performance/makeFrameCostHistory';
import { createEffect } from 'solid-js';
import styles from './PerformancePanel.module.css';

/**
 * Frame-cost panel over the drawing stage's top-left corner: the latest frame's cost and range, the frame rate or
 * IDLE, and stacked CPU and GPU-wait bars against the 60 Hz budget. Drawn on its own 2D canvas because the drawing
 * canvas may belong to a worker; it never appears in exports and takes no pointer events. The device pixel ratio is
 * read when the panel mounts.
 */
export function PerformancePanel(props: {
  /** Recorded frames, oldest first; the latest `historyLength` appear. */
  samples: readonly FrameCostSample[];
  /** No frame is being drawn, so no frame rate applies. */
  idle: boolean;
}) {
  let canvas!: HTMLCanvasElement;
  const dpr = devicePixelRatio;
  const pixels = {
    width: Math.round(performancePanelSize.width * dpr),
    height: Math.round(performancePanelSize.height * dpr)
  };

  createEffect(
    () => layoutPerformancePanel(props.samples, props.idle, { pixels, dpr }),
    (quads) => {
      const context = canvas.getContext('2d');

      if (context) {
        drawPerformancePanel(context, quads, pixels);
      }
    }
  );

  return (
    <canvas
      ref={canvas}
      class={styles.panel}
      width={pixels.width}
      height={pixels.height}
      style={{ width: `${performancePanelSize.width}px`, height: `${performancePanelSize.height}px` }}
      role="img"
      aria-label="Frame performance"
    />
  );
}
