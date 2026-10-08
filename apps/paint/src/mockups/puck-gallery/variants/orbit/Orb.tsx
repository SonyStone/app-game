import type { JSX } from '@solidjs/web';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import type { Point } from '../../kit/createSketchCanvas';
import { galleryUi } from '../../kit/variant';
import styles from './Orbit.module.css';

/**
 * A round satellite button centered on `at` (disc coordinates): Breeze grey, Krita blue while `active`, muted while
 * `disabled` (it still takes presses, so that they never fall through to the drawing). `press` carries its press
 * handlers (`tapPress`, or press-drag ones for navigation); `onHover` reports a hovering pen or mouse, for captions.
 * `part` names it for hiding during navigation drags.
 */
export function Orb(props: {
  at: Point;
  /** Diameter in pixels; 40 by default, the size of primary targets. */
  size?: number;
  icon: SketchIconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  part?: string;
  press: Record<string, (event: PointerEvent) => void>;
  onHover?: (on: boolean) => void;
  children?: JSX.Element;
}) {
  return (
    <button
      class={[styles.orb, { [styles.active!]: props.active === true, [styles.disabled!]: props.disabled === true }]}
      {...galleryUi}
      {...props.press}
      onPointerEnter={(event) => event.pointerType !== 'touch' && props.onHover?.(true)}
      onPointerLeave={() => props.onHover?.(false)}
      data-part={props.part ?? 'ui'}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active === undefined ? undefined : props.active ? 'true' : 'false'}
      style={{
        left: `${props.at.x}px`,
        top: `${props.at.y}px`,
        width: `${props.size ?? 40}px`,
        height: `${props.size ?? 40}px`
      }}
    >
      <SketchIcon name={props.icon} size={(props.size ?? 40) >= 40 ? 19 : 16} />
      {props.children}
    </button>
  );
}
