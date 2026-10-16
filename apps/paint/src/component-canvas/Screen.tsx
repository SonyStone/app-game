import type { JSX } from '@solidjs/web';
import { createContext, useContext } from 'solid-js';
import styles from './ComponentCanvas.module.css';

/**
 * A small stand-in for the window, for components that cover the whole screen and place themselves in window
 * coordinates, such as the navigation puck and its ring. The frame is their containing block, so that
 * `position: fixed` fills it, and the coordinates passed to them must be relative to it.
 *
 * The frame is inert: such components read the pointer in window coordinates, which match the frame's nowhere on a
 * moving canvas. It shows a state; `TryButton` opens a live component full screen. A finger on it moves the canvas.
 * `class` adds a variant's root class, for its tokens.
 */
export function ScreenFrame(props: { width: number; height: number; class?: string; children?: JSX.Element }) {
  return (
    <div data-canvas-touch-pans>
      <div
        class={[styles.screen, props.class]}
        style={{ width: `${props.width}px`, height: `${props.height}px` }}
        data-canvas-screen
        inert
      >
        {props.children}
      </div>
    </div>
  );
}

/**
 * Opens `render` full screen over the canvas, outside its moving world, where the component sees the real window and
 * works as in the app. `render` runs when the stage opens and is disposed with it.
 */
export function TryButton(props: { label: string; title: string; render: () => JSX.Element }) {
  const open = useContext(CanvasStage);

  return (
    <button class={styles.tryButton} onClick={() => open({ title: props.title, render: props.render })}>
      {props.label}
    </button>
  );
}

/** A component opened full screen: its title, shown by the stage's way back, and what it renders. */
export type Stage = { title: string; render: () => JSX.Element };

/** Opens a stage, or closes it with `undefined`; provided by the canvas. */
export const CanvasStage = createContext<(stage: Stage | undefined) => void>();
