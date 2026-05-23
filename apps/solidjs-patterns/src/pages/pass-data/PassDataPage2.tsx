import { For, type JSX } from 'solid-js';
import { template } from 'solid-js/web';
import { CodeBlock } from '../../components/CodeBlock';
import { PageHeader } from '../../components/PatternLayout';
import { blocks as textBlocks } from './pass-data.md?markdown&blocks';

// ============================================================================
// MARK: Pass Data Page
// ============================================================================

export default function PassDataPage2(): JSX.Element {
  console.log('textBlocks', textBlocks);

  return <RenderMarkdownBlocks />;
}

function RenderMarkdownBlocks(): JSX.Element {
  return <For each={textBlocks}>{(block) => <RenderMarkdownBlock block={block} />}</For>;
}

function RenderMarkdownBlock(props: { block: (typeof textBlocks)[number] }): JSX.Element {
  switch (props.block.type) {
    case 'heading': {
      return <PageHeader title={props.block.text}></PageHeader>;
    }
    case 'paragraph': {
      const t = document.createElement('template');
      t.innerHTML = props.block.html;

      return <MyComponent>{t.content}</MyComponent>;
    }
    case 'codeblock': {
      return (
        <CodeBlock class="bg-blue overflow-hidden rounded" code={props.block.code} language={props.block.language}>
          {template(props.block.html)()}
        </CodeBlock>
      );
    }
    default: {
      return template(props.block.html)();
    }
  }
}

function MyComponent(props: { children?: JSX.Element }): JSX.Element {
  return (
    <p class="text-base leading-6 dark:text-slate-300 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:text-slate-900 [&_code]:dark:text-slate-200">
      {props.children}
    </p>
  );
}
