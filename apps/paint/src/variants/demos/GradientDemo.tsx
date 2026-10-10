import { GradientPanel } from '../../features/gradient';
import { createPaintSession } from '../../features/session';
import type { PaintVariantProps } from '..';
import { createDemoStart } from './createDemoStart';
import { createKeptTool } from './createKeptTool';
import { FeatureDemo } from './FeatureDemo';
import { Swatches } from './Swatches';

/** Demo of the gradient tool on an empty drawing of its own. */
export function GradientDemo(props: PaintVariantProps) {
  const session = createPaintSession({ storageName: 'paint-demo-gradient' });
  const { gradient, tools, brush } = session;
  const { reset } = createDemoStart(session, {});
  createKeptTool(session, 'gradient');
  const colors = () => ({ foreground: brush().color, background: brush().backgroundColor ?? '#ffffff' });

  return (
    <FeatureDemo
      session={session}
      title="Gradient"
      summary="Drag across the canvas to lay a gradient from the current color to the background color, with a live preview, as one undo step."
      steps={[
        'Drag across the canvas and release.',
        'Choose another shape, such as Radial, and drag again.',
        'Pick a color below and drag over the previous gradient.'
      ]}
      onReset={reset}
      experimentsHref={props.experimentsHref}
    >
      <Swatches color={brush().color} onPick={(color) => tools.updateBrush({ color })} />
      <GradientPanel settings={gradient.settings()} colors={colors()} onChange={gradient.update} />
    </FeatureDemo>
  );
}
