import type { ViewMode } from './createComparison';

/** Names the pixels actually displayed, including saved previews and retained pending results, independently of requested state. */
export function presentationSource(options: {
  view: ViewMode;
  state: string;
  overrides: number;
  maskOnly: boolean;
  maskOverlay: boolean;
  blinkSaved: boolean;
  initial: 'saved' | 'chosen' | undefined;
  savedWindow: boolean;
  hasRender: boolean;
  pending: boolean;
}) {
  if (options.maskOnly) {
    return 'selected saved mask plane before state transforms';
  }

  const overlay = options.maskOverlay ? ', with selected saved mask overlay' : '';
  if (options.view === 'photoshop' || (options.view === 'blink' && options.blinkSaved)) {
    return `Photoshop's saved merged composite, which may be stale${overlay}`;
  }

  if (options.initial === 'saved' || options.savedWindow) {
    return `temporary saved preview, potentially stale; does not reflect current settings or visibility${overlay}`;
  }

  if (options.initial === 'chosen') {
    return `chosen-settings opening preview; blending fidelity unverified${overlay}`;
  }

  if (!options.hasRender) {
    return 'no admitted current render';
  }

  const current = options.pending
    ? 'retained previous result while the selected state/settings update'
    : `${options.state}, ${options.overrides} transient visibility overrides, current settings`;
  if (options.view === 'difference') {
    return `native difference of ${current} versus Photoshop's saved merged composite${overlay}`;
  }

  if (options.view === 'split' || options.view === 'wipe') {
    return `${options.view}: ${current} on the left; Photoshop's saved merged composite on the right${overlay}`;
  }

  return `layer render of ${current}${overlay}`;
}
