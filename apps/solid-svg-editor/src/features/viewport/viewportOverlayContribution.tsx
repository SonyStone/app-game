import { Show } from 'solid-js';

import type { EditorContribution, ViewportOverlayContribution } from '../../editor/kernel';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { HandlesLayer, SelectionMarquee, TransformBoxLayer } from './ViewportParts';

export type ViewportOverlayRegistryContribution = EditorContribution<EditorPanelContext> & {
  readonly viewportOverlays?: readonly ViewportOverlayContribution<EditorPanelContext>[];
};

export const coreViewportOverlayContribution = {
  id: 'core.viewport-overlays',
  viewportOverlays: [
    {
      id: 'viewport.selection-overlays',
      placement: 'svg-world',
      order: 10,
      render: ({ context, overlays }) => (
        <Show when={context.kernel.settings.settings().showHandles}>
          <HandlesLayer
            handles={overlays.handles()}
            zoom={overlays.zoom()}
            onHandlePointerDown={overlays.startHandleDrag}
          />
          <TransformBoxLayer
            box={overlays.selectionBox()}
            zoom={overlays.zoom()}
            onHandlePointerDown={overlays.startTransformBoxDrag}
          />
        </Show>
      )
    },
    {
      id: 'viewport.selection-marquee',
      placement: 'html',
      order: 10,
      render: ({ overlays }) => <SelectionMarquee rect={overlays.marqueeRect()} />
    }
  ]
} as const satisfies ViewportOverlayRegistryContribution;
