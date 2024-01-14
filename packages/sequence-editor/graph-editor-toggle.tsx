import { createSignal, untrack } from 'solid-js';
import VscTriangleUp from './vsc-triangle-up';

export default function GraphEditorToggle() {
  const [isOpen, setIsOpen] = createSignal(false);
  const toggle = () => setIsOpen(!untrack(isOpen));

  return (
    <button
      onClick={toggle}
      title="Toggle graph editor"
      class={[
        'group outline-none bg-[#1c1d21] border border-[#191919] rounded-0.5 flex bottom-3.5 right-2 z-1 absolute py-1 px-2 text-[#656d77] leading-5 text-xl hover:text-white',
        isOpen() ? 'open' : ''
      ].join(' ')}
    >
      <VscTriangleUp class="transition-transform rotate-0 group-hover:-rotate-20 group-[.open]:-rotate-180 group-[.open]-hover:-rotate-160" />
    </button>
  );
}
