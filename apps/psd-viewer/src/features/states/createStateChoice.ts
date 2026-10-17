import type { PsdRenderSettings, PsdStateChoice } from '@app-game/psd/viewer';
import { createSignal, type Accessor } from 'solid-js';

/**
 * Owns which saved state of the open document renders: `null`, the document as saved, until `choose` picks a layer
 * comp or animation frame; opening another source resets it. `withState` adds the choice to render settings, which
 * stay the viewer's preferences while the state belongs to the document.
 */
export function createStateChoice(source: Accessor<unknown>) {
  const [choice, choose] = createSignal<PsdStateChoice | null>(() => {
    source();
    return null;
  });

  function withState(settings: Accessor<PsdRenderSettings>): Accessor<PsdRenderSettings> {
    return () => ({ ...settings(), state: choice() });
  }

  return { choice, choose, withState };
}
