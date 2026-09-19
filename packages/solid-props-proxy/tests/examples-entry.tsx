import { render } from '@solidjs/web';
import { BodyModesExample } from '../../ui-components-examples/solid-props-proxy/body-modes';
import { CustomElementExample } from '../../ui-components-examples/solid-props-proxy/custom-element';
import { ExternalWidgetExample } from '../../ui-components-examples/solid-props-proxy/external-widget';
import { IframePreviewExample } from '../../ui-components-examples/solid-props-proxy/iframe-preview';
import '../../ui-components-examples/solid-props-proxy/playground.css';
import { StyleLayersExample } from '../../ui-components-examples/solid-props-proxy/style-layers';
import { TargetHandoffExample } from '../../ui-components-examples/solid-props-proxy/target-handoff';
import { WorkspaceStateExample } from '../../ui-components-examples/solid-props-proxy/workspace-state';

/** Runs all seven showcase components with their actual shared styling. */
export function mountExamples() {
  return render(
    () => (
      <div class="props-playground">
        <StyleLayersExample />
        <BodyModesExample />
        <ExternalWidgetExample />
        <TargetHandoffExample />
        <IframePreviewExample />
        <WorkspaceStateExample />
        <CustomElementExample />
      </div>
    ),
    document.getElementById('examples')!
  );
}
