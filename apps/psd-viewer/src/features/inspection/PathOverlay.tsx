import type { PsdSavedPath } from '@app-game/psd/viewer';
import { For } from 'solid-js';
import type { View } from '../viewport/view';

/** Saved geometry is already in document pixels. Camera transform matches the composite, independent of DPR. */
export function PathOverlay(props: { path: Extract<PsdSavedPath, { outcome: 'geometry' }>; view: View }) {
  return (
    <svg
      aria-label="Saved path overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        'pointer-events': 'none'
      }}
    >
      <g transform={`translate(${props.view.x} ${props.view.y}) scale(${props.view.scale})`}>
        <For each={props.path.components}>
          {(component) => (
            <For each={component.subpaths}>
              {(path) => (
                <>
                  <path
                    d={pathGeometry(path)}
                    fill="none"
                    stroke="#36d4ff"
                    stroke-width="1.5"
                    vector-effect="non-scaling-stroke"
                  />
                  <For each={path.knots}>
                    {(knot) => (
                      <>
                        <path
                          d={`M ${knot.before.join(' ')} L ${knot.anchor.join(' ')} L ${knot.after.join(' ')}`}
                          fill="none"
                          stroke="#ffbd55"
                          stroke-width="1"
                          vector-effect="non-scaling-stroke"
                        />
                        <circle cx={knot.anchor[0]} cy={knot.anchor[1]} r={3 / props.view.scale} fill="#36d4ff" />
                      </>
                    )}
                  </For>
                </>
              )}
            </For>
          )}
        </For>
      </g>
    </svg>
  );
}

/** Cubic handles join consecutive anchors and close only explicitly closed subpaths. */
export function pathGeometry(
  path: Extract<PsdSavedPath, { outcome: 'geometry' }>['components'][number]['subpaths'][number]
): string {
  const first = path.knots[0];
  if (!first) {
    return '';
  }

  const segments = path.knots
    .slice(1)
    .map((next, index) => `C ${path.knots[index]!.after.join(' ')} ${next.before.join(' ')} ${next.anchor.join(' ')}`);
  if (path.closed) {
    segments.push(`C ${path.knots.at(-1)!.after.join(' ')} ${first.before.join(' ')} ${first.anchor.join(' ')} Z`);
  }
  return `M ${first.anchor.join(' ')} ${segments.join(' ')}`;
}

/** Preserve Unicode code units where present; legacy bytes are decoded only for the list label. */
export function pathName(path: PsdSavedPath): string {
  return path.unicodeName
    ? Array.from(path.unicodeName, (unit) => String.fromCharCode(unit)).join('')
    : new TextDecoder('macintosh').decode(path.legacyName) || `Path ${path.resourceId ?? path.namedIndex}`;
}
