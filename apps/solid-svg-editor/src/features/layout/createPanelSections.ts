import { createSignal, type Accessor } from 'solid-js';

import type { PanelId } from '../../editor/types';
import type { PanelLayout } from './panel-layout';

/** One section of the left column: its panels (shown as tabs) and the one on display. */
export type PanelSection = {
  readonly id: 'top' | 'bottom';
  readonly panels: readonly PanelId[];
  readonly active: PanelId | undefined;
  readonly setActive: (panel: PanelId) => void;
};

/**
 * The left column's sections from GodSVG's layout, each remembering its chosen tab (a tab that leaves the section
 * falls back to the first one). The Debug panel isn't part of GodSVG's layout; "View debug information" shows it as
 * an extra tab in the top section.
 */
export function createPanelSections(options: { readonly layout: Accessor<PanelLayout> }) {
  const [debugVisible, setDebugVisible] = createSignal(false);
  const [chosen, setChosen] = createSignal<Readonly<Partial<Record<PanelSection['id'], PanelId>>>>({});
  const panelsOf = (id: PanelSection['id']): readonly PanelId[] =>
    id === 'top' ? [...options.layout().top, ...(debugVisible() ? (['debug'] as const) : [])] : options.layout().bottom;

  const sections = (): readonly PanelSection[] =>
    (['top', 'bottom'] as const)
      .map((id) => {
        const panels = panelsOf(id);
        const picked = chosen()[id];
        return {
          id,
          panels,
          active: picked && panels.includes(picked) ? picked : panels[0],
          setActive: (panel: PanelId) => setChosen((current) => ({ ...current, [id]: panel }))
        };
      })
      .filter((section) => section.panels.length > 0);

  /** Shows a panel in whichever section holds it; excluded panels stay hidden. */
  function activate(panel: PanelId): void {
    if (panel === 'debug') {
      setDebugVisible(true);
    }

    const section = options.layout().bottom.includes(panel as never) ? 'bottom' : 'top';
    setChosen((current) => ({ ...current, [section]: panel }));
  }

  /** "View debug information": shows the Debug tab, or hides it again. */
  function toggleDebug(): void {
    if (debugVisible()) {
      setDebugVisible(false);
    } else {
      activate('debug');
    }
  }

  return { sections, activate, toggleDebug };
}
