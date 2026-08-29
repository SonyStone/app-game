import type { ComponentProps } from '@solidjs/web';
import PanelResizers from './panel-resizers';

export function PanelWrapper(
  props: ComponentProps<'div'> & { dimensions: { width: number; height: number; top: number; left: number } }
) {
  return (
    <div
      class="absolute z-1000 box-border select-none in-[#pointer-root]:pointer-events-none [#pointer-root.normal_&]:pointer-events-auto"
      style={{
        width: props.dimensions.width + 'px',
        height: props.dimensions.height + 'px',
        top: props.dimensions.top + 'px',
        left: props.dimensions.left + 'px'
      }}
      {...props}
    >
      <PanelResizers />
      {props.children}
    </div>
  );
}
