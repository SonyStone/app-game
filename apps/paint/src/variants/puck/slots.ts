import type { SketchIconName } from '../../shared/ui/SketchIcon';
import type { ViewDragKind } from './createViewDrag';

/** A QuickMenu button. */
export type Slot = {
  id: SlotId;
  label: string;
  icon: SketchIconName;
  /** The digit that runs it while the cluster is open. */
  key: string;
  /** Degrees clockwise from the right. */
  angle: number;
  /** The view drag it starts, for Pan, Zoom and Rotate. */
  nav?: ViewDragKind;
};

/** The QuickMenu's buttons. */
export type SlotId = 'zoom' | 'rotate' | 'redo' | 'picker' | 'undo' | 'pan';

/** The six QuickMenu buttons, clockwise from the top: navigation above, history below, the eyedropper at the bottom. */
export const slots: readonly Slot[] = [
  { id: 'zoom', label: 'Zoom', icon: 'zoom', key: '2', angle: -90, nav: 'zoom' },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', key: '3', angle: -30, nav: 'rotate' },
  { id: 'redo', label: 'Redo', icon: 'redo', key: '5', angle: 30 },
  { id: 'picker', label: 'Eyedropper', icon: 'picker', key: '6', angle: 90 },
  { id: 'undo', label: 'Undo', icon: 'undo', key: '4', angle: 150 },
  { id: 'pan', label: 'Pan', icon: 'pan', key: '1', angle: 210, nav: 'pan' }
];

/** The slot in the direction of a move from the QuickMenu's center, by angle (y down, as on screen). */
export function slotToward(dx: number, dy: number): Slot {
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const distance = (slot: Slot) => Math.abs(((angle - slot.angle + 540) % 360) - 180);
  return slots.reduce((best, slot) => (distance(slot) < distance(best) ? slot : best));
}
