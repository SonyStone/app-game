import { ComponentProps } from 'solid-js';

export default function MathExamples(props: ComponentProps<'div'>) {
  return (
    <>
      <div class="flex w-full place-content-center place-items-center bg-blue-100">Math Examples</div>
      {props.children}
    </>
  );
}
