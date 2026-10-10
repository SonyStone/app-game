import { SketchIcon } from '../../shared/ui/SketchIcon';
import { penModeInfo, type PenMode } from './createPenModes';

/**
 * A pen mode's icon: the shared sketch icon, or a drawing of this variant's own for modes the shared set has none for
 * (the straight line and loading paint), in the same 24-unit line style.
 */
export function ModeIcon(props: { mode: PenMode; size: number }) {
  return (
    <>
      {ownIcons[props.mode] ? (
        <svg
          width={props.size}
          height={props.size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.65"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={ownIcons[props.mode]} />
        </svg>
      ) : (
        <SketchIcon name={penModeInfo[props.mode].icon} size={props.size} />
      )}
    </>
  );
}

/** Paths of the modes drawn here rather than by `SketchIcon`. */
const ownIcons: Partial<Record<PenMode, string>> = {
  line: 'M7.4 16.6 16.6 7.4M4 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0M16 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  mixer: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11ZM9 14a3 3 0 0 0 3 3'
};
