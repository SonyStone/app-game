import type { JSX } from '@solidjs/web';
import studio from '../features/studio/PaintStudio.module.css';
import desktop from '../variants/desktop/DesktopStudio.module.css';
import infinite from '../variants/infinite/theme.module.css';
import cluster from '../variants/puck/cluster.module.css';
import { clusterLayout, type Box } from '../variants/puck/layout';
import zen from '../variants/zen/ZenStudio.module.css';
import styles from './ComponentCanvas.module.css';

/*
 * Frames that give a variant's parts what they read from the variant around them: its tokens and its ground. Each
 * frame applies the variant's own root class, so its parts look as in the variant, and overrides inline only what
 * would place the frame itself (the variants' roots fill or anchor to the screen).
 */

/**
 * The Puck variant's cluster around parts placed at `boxes`, cluster coordinates from `puckBoxes`, cut to the boxes'
 * extent: the cluster's root is a zero-size anchor at the QuickMenu's center, which the frame moves so that the
 * extent starts at its corner. The ground is Paint's paper, as the cluster opens over the drawing.
 */
export function PuckFrame(props: { boxes: readonly Box[]; children: JSX.Element }) {
  const extent = () => {
    const left = Math.min(...props.boxes.map((box) => box.x));
    const top = Math.min(...props.boxes.map((box) => box.y));
    const right = Math.max(...props.boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...props.boxes.map((box) => box.y + box.height));
    return { left, top, width: right - left, height: bottom - top };
  };

  return (
    <div
      class={styles.variantGround}
      style={{ width: `${extent().width + framePadding * 2}px`, height: `${extent().height + framePadding * 2}px` }}
    >
      <div
        class={cluster.root}
        style={{ left: `${framePadding - extent().left}px`, top: `${framePadding - extent().top}px` }}
      >
        {props.children}
      </div>
    </div>
  );
}

/**
 * The Puck variant's parts as it arranges them for a pen in the middle of a MovinkPad-sized screen, right-handed:
 * boxes relative to the QuickMenu's center.
 */
export const puckBoxes = clusterLayout({ x: 823, y: 455 }, { width: 1646, height: 909 }, 'right').boxes;

/** The Desktop variant's dark workspace tokens and type around its parts, `width` wide, as a dock panel is. */
export function DesktopFrame(props: { width?: number; children: JSX.Element }) {
  return (
    <div
      class={[desktop.editor, styles.desktopGround]}
      style={{ display: 'block', width: props.width === undefined ? undefined : `${props.width}px` }}
    >
      {props.children}
    </div>
  );
}

/**
 * The Infinite Painter variant's tokens on its dark ground around its parts, which float over the drawing in the
 * variant; `width` and `height` give the frame a size for parts that place themselves against its edges.
 */
export function InfiniteFrame(props: { width?: number; height?: number; children: JSX.Element }) {
  return (
    <div
      class={[infinite.theme, styles.infiniteGround]}
      style={{
        width: props.width === undefined ? undefined : `${props.width}px`,
        height: props.height === undefined ? undefined : `${props.height}px`
      }}
    >
      {props.children}
    </div>
  );
}

/** The Zen variant's light surface and tokens around its parts. */
export function ZenFrame(props: { width?: number; children: JSX.Element }) {
  return (
    <div
      class={[zen.editor, styles.zenGround]}
      style={{ width: props.width === undefined ? undefined : `${props.width}px` }}
    >
      {props.children}
    </div>
  );
}

/**
 * Studio's tokens and resets in a box of `width` × `height`, for its parts that place themselves against the screen's
 * edges, such as the tool rail at the left edge's middle.
 */
export function StudioFrame(props: { width: number; height: number; children: JSX.Element }) {
  return (
    <div
      class={[studio.studio, styles.studioGround]}
      style={{ width: `${props.width}px`, height: `${props.height}px` }}
    >
      {props.children}
    </div>
  );
}

/** Room around a cluster's parts inside their frame. */
const framePadding = 16;
