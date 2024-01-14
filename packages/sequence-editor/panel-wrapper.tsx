import { ComponentProps } from 'solid-js';
import PanelResizers from './panel-resizers';

export function PanelWrapper(
  props: ComponentProps<'div'> & { dimensions: { width: number; height: number; top: number; left: number } }
) {
  return (
    <div
      class="absolute select-none box-border [#pointer-root_&]:pointer-events-none [#pointer-root.normal_&]:pointer-events-auto z-1000"
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
