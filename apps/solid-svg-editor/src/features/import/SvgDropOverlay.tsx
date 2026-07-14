import { Show } from 'solid-js';

import type { EditorKernel } from '../../editor/kernel';
import { decorativeIconProps } from '../../editor/svg-icon';
import ImportIcon from '../ui/icons/Import.svg';

export function SvgDropOverlay<TPanelContext>(props: { readonly kernel: EditorKernel<TPanelContext> }) {
  const svgImport = () => props.kernel.ui.svgImport;

  return (
    <Show when={svgImport()?.dropActive()}>
      <div
        class="svg-drop-overlay pointer-events-none fixed inset-[44px_18px_18px] z-90 grid place-items-center content-center gap-3 rounded-lg border-2 border-dashed border-[color-mix(in_srgb,var(--accent)_78%,#ffffff)] bg-[color-mix(in_srgb,var(--base)_76%,transparent)] text-lg text-white shadow-[inset_0_0_0_999px_#0005]"
        data-testid="svg-drop-overlay"
      >
        <ImportIcon {...decorativeIconProps} />
        <span>Drop SVG to import</span>
      </div>
    </Show>
  );
}
