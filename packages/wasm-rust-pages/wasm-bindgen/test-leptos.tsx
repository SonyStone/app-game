import { onCleanup } from 'solid-js';
import { LeptosElement } from './test_leptos/pkg/test_leptos';

export default function TestLeptos() {
  const element = LeptosElement.new();

  onCleanup(() => {
    element.free();
  });

  return (
    <div class="flex flex-col gap-1 px-1">
      <span>WGPU from Rust:</span>
      {element.element}
    </div>
  );
}
