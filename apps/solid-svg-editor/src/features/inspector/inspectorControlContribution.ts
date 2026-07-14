import type { SvgCapabilityContribution } from '../../editor/kernel';
import { coreSvgCapabilityContribution } from '../../editor/svg-capabilities/coreSvgContribution';

type SvgAttributeControlRenderer = NonNullable<
  NonNullable<SvgCapabilityContribution['attributes']>[number]['control']
>;

export function createCoreInspectorControlContribution(
  renderControl: SvgAttributeControlRenderer
): SvgCapabilityContribution {
  return {
    id: 'core.svg.inspector-controls',
    attributes: coreSvgCapabilityContribution.attributes.map((attribute) => ({
      name: attribute.name,
      control: renderControl
    }))
  };
}
