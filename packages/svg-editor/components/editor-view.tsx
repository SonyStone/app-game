import { createElementSize } from '@solid-primitives/resize-observer';
import { createSignal, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { SVGNode } from '../svg-node';
import { DataWrapper, OutlinePreview, useSvgSelect } from '../use-svg-select';

export function EditView(props: { select: ReturnType<typeof useSvgSelect<SVGNode>>; state: SVGNode }) {
  const [target, setTarget] = createSignal<HTMLElement>();
  const size = createElementSize(target);

  return (
    <div id="Edit View" class="h-full w-full select-none" ref={setTarget}>
      <svg
        class="bg-gray-500"
        ref={props.select.setSvgRef}
        width={size.width ?? 400}
        height={size.height ?? 400}
        viewBox={`0 0 ${size.width} ${size.height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* <rect
        class="pointer-events-none"
        fill="#ffffff"
        x={state.viewBox.split(' ')[0]}
        y={state.viewBox.split(' ')[1]}
        width={state.viewBox.split(' ')[2]}
        height={state.viewBox.split(' ')[3]}
        data-ignore-selection={true}
      /> */}
        <g {...props.state}>
          <For each={props.state.children}>{(child) => SVGRender(child)}</For>
        </g>

        <g id="huds">
          <g></g>
          <OutlinePreview selectedElements={Array.from(props.select.selectedElementsIdsMap.values())} />
          {/* <BoxesPreview selectedElements={select.selectedElements()} /> */}
          <props.select.LassoSelectionPreview />
          <props.select.RectangleSelectionPreview />
        </g>
      </svg>
    </div>
  );
}

export function SVGRender(props: SVGNode) {
  return (
    <Dynamic
      {...props}
      ref={(ref: Element) => {
        (ref as DataWrapper<Element, SVGNode>)._inner_id = props;
      }}
    >
      <For each={props.children}>{(child) => SVGRender(child)}</For>
    </Dynamic>
  );
}
