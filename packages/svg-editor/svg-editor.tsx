import { createSignal, For, Match, Switch, untrack } from 'solid-js';
import { DOMElement } from 'solid-js/jsx-runtime';

export default function SVGEditorApp() {
  return (
    <div id="MainScene">
      <div id="PanelContainer" class="min-w-360px">
        <div class="flex">
          <div id="MainContainer">
            <CodeEditor />
            <Inspector />
          </div>
          <Display />
        </div>
      </div>
    </div>
  );
}

function CodeEditor() {
  return (
    <div id="CodeEditor">
      <div id="CodeButtons"></div>
      <div id="ScriptEditor"></div>
    </div>
  );
}

function Inspector() {
  return (
    <div id="Inspector">
      <div id="InspectorContainer"></div>
    </div>
  );
}

let id = 0;
const getId = () => id++;
const getLineId = () => 'line-' + getId();
const getPathId = () => 'path-' + getId();
const getGripId = () => 'grip-' + getId();

// hud

function useSelectedSvg() {
  const [selectedRef, setSelectedRef] = createSignal<SVGElement[]>([]);

  const handlePointerDown = (
    e: PointerEvent & {
      currentTarget: SVGSVGElement;
      target: DOMElement;
    }
  ): void => {
    const selected = untrack(selectedRef);
    const target = e.target as SVGElement;

    switch (true) {
      case target.nodeName === 'svg' && e.shiftKey: {
        return;
      }
      case target.nodeName === 'svg' && !e.shiftKey: {
        setSelectedRef([]);
        return;
      }
      case e.shiftKey && !selected.includes(target): {
        setSelectedRef((prev) => prev.concat(target as SVGElement));
        return;
      }
      case !e.shiftKey: {
        setSelectedRef([target]);
      }
    }
  };

  const outline = (
    <For each={selectedRef()}>
      {(selected) => (
        <Switch>
          <Match when={selected.nodeName === 'path'}>
            <path
              d={(selected as SVGPathElement).getAttribute('d') ?? ''}
              class="contain-layout contain-style contain-paint pointer-events-none fill-none stroke-[rgb(245,92,54)] stroke-2 [vector-effect:non-scaling-stroke]"
              transform="matrix(1, 0, 0, 1, 0, 0)"
            />
          </Match>
          <Match when={selected.nodeName === 'circle'}>
            {(() => {
              const circleRef = selected as SVGCircleElement;
              const cx = circleRef.getAttribute('cx') ?? 0;
              const cy = circleRef.getAttribute('cy') ?? 0;
              const r = circleRef.getAttribute('r') ?? 0;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  class="contain-layout contain-style contain-paint pointer-events-none fill-none stroke-[rgb(245,92,54)] stroke-2 [vector-effect:non-scaling-stroke]"
                  transform="matrix(1, 0, 0, 1, 0, 0)"
                ></circle>
              );
            })()}
          </Match>
        </Switch>
      )}
    </For>
  );

  return {
    handlePointerDown,
    render: outline
  };
}

/**
 *
 * @returns
 */
function Display() {
  const select = useSelectedSvg();

  return (
    <div id="Display">
      <div id="ToolbarContainer">
        <svg
          width={400}
          height={400}
          viewBox="0 0 400 400"
          xmlns="http://www.w3.org/2000/svg"
          onPointerDown={select.handlePointerDown}
        >
          <line id={getLineId()} x1="0" y1="80" x2="100" y2="20" stroke="black" />
          <path id={getPathId()} d="M10 10" />
          <path id={getPathId()} d="M 10 10 h 90 v 90 h -90 z" />
          <path id={getPathId()} d="M 110 110 h 90 v 90 h -90 z" />
          <Grip pos={[10, 10]} />
          <Grip pos={[10, 10]} />

          <g id="huds">
            <g id="outline-hud">{select.render}</g>
          </g>
        </svg>
      </div>
    </div>
  );
}

function Grip(props: { pos: [number, number] }) {
  return (
    <circle
      id={getGripId()}
      class="fill-white stroke-black stroke-1 [vector-effect:non-scaling-stroke]"
      cx={props.pos[0]}
      cy={props.pos[1]}
      r={10}
    />
  );
}
