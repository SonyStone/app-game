import { ComponentProps } from 'solid-js';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      math: ComponentProps<'div'> & Partial<{ display: 'block' | 'inline' }>;
      mrow: ComponentProps<'div'>;
      mi: ComponentProps<'div'>;
      mo: ComponentProps<'div'>;
      mn: ComponentProps<'div'>;
    }
  }
}

export default function PlaneEquation() {
  return (
    <div>
      Plane Equation:
      {planeEquation}
      <svg class="border" height={400} width={400} viewBox="0 0 2 2">
        <g transform="scale(1, -1) translate(1 1)" transform-origin="center">
          <line x1="-0.9" y1="0" x2="0.9" y2="0" stroke="black" stroke-width="0.001" />
          <line x1="0" y1="-0.9" x2="0" y2="0.9" stroke="black" stroke-width="0.001" />
        </g>
      </svg>
    </div>
  );
}

const planeEquation = (
  <math class="block">
    <mrow>
      <mi>A</mi>
      <mi>x</mi>
      <mo>+</mo>
      <mi>B</mi>
      <mi>y</mi>
      <mo>+</mo>
      <mi>C</mi>
      <mi>z</mi>
      <mo>+</mo>
      <mi>D</mi>
      <mo>=</mo>
      <mn>0</mn>
    </mrow>
  </math>
) as MathMLElement;
