import { FillPanel } from '../../features/fill';
import { createPaintSession } from '../../features/session';
import type { PaintVariantProps } from '..';
import { createDemoStart } from './createDemoStart';
import { createKeptTool } from './createKeptTool';
import { FeatureDemo } from './FeatureDemo';
import { lineArtFile } from './lineArt';
import { Swatches } from './Swatches';

/** Demo of the fill on prepared line art, in a drawing of its own. */
export function FillDemo(props: PaintVariantProps) {
  const session = createPaintSession({ storageName: 'paint-demo-fill' });
  const { fill, tools } = session;
  const { reset } = createDemoStart(session, { seed: lineArtFile });
  createKeptTool(session, 'fill');

  return (
    <FeatureDemo
      session={session}
      title="Fill"
      summary="Fills an enclosed area with the current color in one tap, as one undo step. Close gaps bridges small breaks in the line art."
      steps={[
        'Tap inside a shape to fill it.',
        'Pick another color below and fill the next shape.',
        'Raise Close gaps, then fill an area whose outline has a break.'
      ]}
      onReset={reset}
      experimentsHref={props.experimentsHref}
    >
      <Swatches color={tools.brush().color} onPick={(color) => tools.updateBrush({ color })} />
      <FillPanel settings={fill.settings()} onChange={fill.update} />
    </FeatureDemo>
  );
}
