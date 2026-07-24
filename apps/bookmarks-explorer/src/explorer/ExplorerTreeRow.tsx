import { createEffect, createSignal, Match, onCleanup, Switch } from 'solid-js';
import { noFaviconUrl } from '../assets';
import type { ExplorerTreeGroupNode, ExplorerTreeLinkNode, ExplorerTreeNode } from './model';

/** Renders explorer-specific content without owning generic tree structure or interactions. */
export function ExplorerTreeRow(props: { node: ExplorerTreeNode }) {
  return (
    <Switch>
      <Match when={props.node.kind === 'group' ? props.node : undefined}>
        {(node) => <GroupLabel node={node()} />}
      </Match>
      <Match when={props.node.kind === 'link' ? props.node : undefined}>{(node) => <LinkLabel node={node()} />}</Match>
      <Match when={props.node.kind === 'message'}>
        <span class="min-w-0 flex-1 truncate text-neutral-500 italic">{props.node.title}</span>
      </Match>
    </Switch>
  );
}

function GroupLabel(props: { node: ExplorerTreeGroupNode }) {
  return (
    <div class="flex min-w-0 flex-1 items-center overflow-hidden font-medium text-neutral-200" title={props.node.title}>
      <span class="mr-1 inline-block w-4 flex-none text-center" aria-hidden="true">
        {groupIcon(props.node.groupKind)}
      </span>
      <span class="truncate">{props.node.title}</span>
    </div>
  );
}

function LinkLabel(props: { node: ExplorerTreeLinkNode }) {
  const content = (
    <>
      <FaviconIcon url={props.node.faviconUrl} />
      <span class="truncate">{props.node.title}</span>
    </>
  );

  return props.node.url ? (
    <a
      class="flex min-w-0 flex-1 items-center pe-4 text-neutral-200 hover:bg-neutral-800 hover:text-white"
      href={props.node.url}
      title={props.node.description}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
    >
      {content}
    </a>
  ) : (
    <span class="flex min-w-0 flex-1 items-center pe-4 text-neutral-400" title={props.node.description}>
      {content}
    </span>
  );
}

function FaviconIcon(props: { url: string | null }) {
  const [source, setSource] = createSignal(noFaviconUrl);
  let image: HTMLImageElement | undefined;

  createEffect(() => {
    const faviconUrl = props.url;
    setSource(noFaviconUrl);
    if (!faviconUrl || !image) {
      return;
    }
    onCleanup(observeWhenVisible(image, () => setSource(faviconUrl)));
  });

  return (
    <img
      ref={image}
      class="mr-1 h-4 w-4 flex-none"
      src={source()}
      alt=""
      draggable={false}
      decoding="async"
      onError={() => {
        if (source() !== noFaviconUrl) {
          setSource(noFaviconUrl);
        }
      }}
    />
  );
}

function observeWhenVisible(element: Element, load: () => void): () => void {
  const observer = getFaviconObserver();
  if (!observer) {
    load();
    return () => undefined;
  }

  faviconLoaders.set(element, load);
  observer.observe(element);
  return () => {
    observer.unobserve(element);
    faviconLoaders.delete(element);
  };
}

function getFaviconObserver(): IntersectionObserver | undefined {
  if (faviconObserver) {
    return faviconObserver;
  }
  if (typeof IntersectionObserver === 'undefined') {
    return undefined;
  }

  faviconObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const load = faviconLoaders.get(entry.target);
        if (!load) {
          observer.unobserve(entry.target);
          continue;
        }
        observer.unobserve(entry.target);
        faviconLoaders.delete(entry.target);
        load();
      }
    },
    { rootMargin: `${FAVICON_LOAD_MARGIN}px` }
  );
  return faviconObserver;
}

function groupIcon(kind: ExplorerTreeGroupNode['groupKind']): string {
  switch (kind) {
    case 'source':
      return '◉';
    case 'window':
      return '▣';
    case 'folder':
      return '▸';
    case 'date':
      return '◷';
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

const faviconLoaders = new Map<Element, () => void>();
const FAVICON_LOAD_MARGIN = 160;
let faviconObserver: IntersectionObserver | undefined;
