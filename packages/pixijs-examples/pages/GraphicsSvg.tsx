import { Container, Graphics } from '@packages/solid-pixi';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { GraphicsOptions } from 'pixi.js';
import { createEffect, createSignal, Show } from 'solid-js';

export default function GraphicsSvg(props: Omit<GraphicsOptions, 'children'>) {
  const [toggle, setToggle] = createSignal(false);
  const size = createWindowSize();

  const svg = (
    <svg height="400" width="450" xmlns="http://www.w3.org/2000/svg">
      {/* <!-- Draw the paths --> */}
      <path id="lineAB" d="M 100 350 l 150 -300" stroke="red" stroke-width="4" />
      <path id="lineBC" d="M 250 50 l 150 300" stroke="red" stroke-width="4" />
      <path id="lineMID" d="M 175 200 l 150 0" stroke="green" stroke-width="4" />
      <path id="lineAC" d="M 100 350 q 150 -300 300 0" stroke="blue" fill="none" stroke-width="4" />

      {/* <!-- Mark relevant points --> */}
      <Show when={toggle()}>
        <g stroke="black" stroke-width="3" fill="black">
          <circle id="pointA" cx="100" cy="350" r="4" />
          <circle id="pointB" cx="250" cy="50" r="4" />
          <circle id="pointC" cx="400" cy="350" r="4" />
        </g>
      </Show>
    </svg>
  ) as SVGAElement;

  return (
    <Container>
      <Graphics
        pivot={{ x: 225, y: 200 }}
        x={size.width / 2}
        y={size.height / 2}
        ref={(graphics) => {
          createEffect(() => {
            toggle();
            graphics.clear();
            graphics.svg(svg as unknown as string);
          });
        }}
        interactive
        onmouseleave={() => {
          setToggle(false);
        }}
        onmouseenter={() => {
          setToggle(true);
        }}
        {...props}
      />
    </Container>
  );
}
