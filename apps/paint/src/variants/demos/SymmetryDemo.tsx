import { defaultPaintSymmetry } from '@app-game/paint-core/symmetry';
import { createPaintSession } from '../../features/session';
import { SymmetryPanel } from '../../features/symmetry';
import type { PaintVariantProps } from '..';
import { createDemoStart } from './createDemoStart';
import { FeatureDemo } from './FeatureDemo';
import { Swatches } from './Swatches';

/** Demo of symmetric painting, starting with a six-way radial symmetry around the origin. */
export function SymmetryDemo(props: PaintVariantProps) {
  const session = createPaintSession({ storageName: 'paint-demo-symmetry' });
  const { symmetry, camera, tools, brush } = session;
  const { reset } = createDemoStart(session, {
    features: { symmetry: { ...defaultPaintSymmetry(), mode: 'radial', segments: 6 } }
  });

  return (
    <FeatureDemo
      session={session}
      title="Symmetry"
      summary="Every stroke is repeated around the guides: mirrored across axes or turned around a center."
      steps={[
        'Draw near the center: six copies follow the pen.',
        'Switch to Vertical or Mandala and draw again.',
        'Move the center with Center in view after panning.'
      ]}
      onReset={reset}
      experimentsHref={props.experimentsHref}
    >
      <Swatches color={brush().color} onPick={(color) => tools.updateBrush({ color })} />
      <SymmetryPanel
        symmetry={symmetry.symmetry()}
        disabled={!session.canUpdateSymmetry()}
        inactive={!session.supportsSymmetry()}
        viewCenter={camera.camera()}
        onChange={symmetry.update}
      />
    </FeatureDemo>
  );
}
