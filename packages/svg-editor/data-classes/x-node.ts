import { Element } from './element';

// Abstract base class for XML nodes.
export class XNode {
  xid?: number[];

  parent?: Element;

  svg?: ElementSVG;

  root?: ElementRoot;

  // Overridden only in Element. In other XNodes, it does nothing.
  propagate_xid_correction(): void {}
}
