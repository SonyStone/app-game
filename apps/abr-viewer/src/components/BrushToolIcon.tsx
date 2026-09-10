import mixer from '../assets/icons/brush-tools/brush-variant.svg?url';
import brush from '../assets/icons/brush-tools/brush.svg?url';
import eraser from '../assets/icons/brush-tools/eraser.svg?url';
import smudge from '../assets/icons/brush-tools/hand-pointing-up.svg?url';
import pencil from '../assets/icons/brush-tools/pencil.svg?url';
import sharpen from '../assets/icons/brush-tools/triangle.svg?url';
import blur from '../assets/icons/brush-tools/water.svg?url';
import unknown from '../assets/icons/tool-options/question-mark.svg?url';
import styles from './BrushToolIcon.module.css';

/** One tool vocabulary for the picker and preset badges; unknown imported classes remain identifiable. */
export function brushToolIcon(type: string): string {
  return toolIcons[type] ?? unknown;
}

/** Decorative icon when embedded beside a label; supply a label for an icon-only preset badge. */
export function BrushToolIcon(props: { type: string; label?: string }) {
  return (
    <img
      class={styles.brushToolIcon}
      src={brushToolIcon(props.type)}
      alt={props.label ?? ''}
      title={props.label}
    />
  );
}

const toolIcons: Record<string, string> = {
  PbTl: brush,
  PcTl: pencil,
  ErTl: eraser,
  SmTl: smudge,
  MixB: mixer,
  ShTl: sharpen,
  BlTl: blur
};
