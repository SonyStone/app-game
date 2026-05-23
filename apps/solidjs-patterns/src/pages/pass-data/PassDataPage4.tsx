import { cn } from '@app-game/utils/cn';
import { ComponentProps, type JSX } from 'solid-js';
import s from '../../components/CodeBlock.module.css';
import passData from './test.html?raw';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'doc-custom-element': ComponentProps<'div'>;
    }
  }
}

export default function PassDataPage4(): JSX.Element {
  const t = document.createElement('template');
  t.innerHTML = passData;

  console.log('t.content', t.content);

  for (const el of t.content.querySelectorAll('doc-custom-element')) {
    console.log('el', el);

    const customEL = (
      <DocCustomElement>
        <p>This is content inside a custom element!</p>
      </DocCustomElement>
    );

    el.replaceWith(customEL());
  }

  return (
    <div
      class={cn(
        s.shiki,
        '[&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-gray-200 [&_pre]:bg-gray-600 [&_pre]:p-1',
        '[&_p]:text-base [&_p]:leading-6 [&_p]:dark:text-slate-300 [&_p_code]:rounded [&_p_code]:bg-white/10 [&_p_code]:px-1 [&_p_code]:py-0.5 [&_p_code]:text-[11px] [&_p_code]:text-slate-900 [&_p_code]:dark:text-slate-200',
        '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h2]:dark:text-slate-200',
        // '[&_h2+_p]:mt-0.5 [&_h2+_p]:text-xs [&_h2+_p]:text-stone-500 [&_h2+_p]:dark:text-slate-500',
        '[&_a]:text-blue-600 [&_a]:underline [&_a]:dark:text-blue-400',
        `[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-stone-950 [&_h1]:dark:text-white`
      )}
    >
      {t.content}
    </div>
  );
}

function DocCustomElement(props: { children?: JSX.Element }): JSX.Element {
  return <doc-custom-element class="flex rounded bg-red-500/50 p-4 text-white">{props.children}</doc-custom-element>;
}
