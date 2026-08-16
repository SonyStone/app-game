import { createEffect, createSignal, Match, onCleanup, Switch } from 'solid-js';
import { noFaviconUrl } from '../assets';
import type { BrowserAtlasAppearanceSettings } from '../settings';
import type { ExplorerTreeGroupNode, ExplorerTreeLinkNode, ExplorerTreeNode } from './model';

/** Props for explorer-specific tree row content. */
export type ExplorerTreeRowProps = {
  /** Normalized node rendered in the row. */
  node: ExplorerTreeNode;
  /** Whether a live or saved browser item activates on its first unmodified click. */
  activateOnSingleClick?: boolean;
  /** Theme and optional semantic label colors. */
  appearance: BrowserAtlasAppearanceSettings;
  /** Activates a browser item, optionally using its alternative saved-session restore. */
  onActivate?: (node: ExplorerTreeGroupNode | ExplorerTreeLinkNode, alternativeRestore: boolean) => void;
  /** Handles link clicks that require backend-specific activation instead of navigation. */
  onLinkClick?: (node: ExplorerTreeLinkNode, event: MouseEvent & { currentTarget: HTMLAnchorElement }) => void;
  /** Handles a backend-specific primary action such as close-and-save or restore. */
  onAction?: (node: ExplorerTreeGroupNode | ExplorerTreeLinkNode) => void;
  /** Permanently removes a live or retained persistent item using the view's collapse semantics. */
  onDelete?: (node: ExplorerTreeGroupNode | ExplorerTreeLinkNode) => void;
};

/** Renders explorer-specific content without owning generic tree structure or interactions. */
export function ExplorerTreeRow(props: ExplorerTreeRowProps) {
  return (
    <Switch>
      <Match when={props.node.kind === 'group' ? props.node : undefined}>
        {(node) => (
          <GroupLabel
            node={node()}
            activateOnSingleClick={props.activateOnSingleClick}
            onActivate={props.onActivate}
            onAction={props.onAction}
            onDelete={props.onDelete}
          />
        )}
      </Match>
      <Match when={props.node.kind === 'link' ? props.node : undefined}>
        {(node) => (
          <LinkLabel
            node={node()}
            appearance={props.appearance}
            onLinkClick={props.onLinkClick}
            onAction={props.onAction}
            onDelete={props.onDelete}
          />
        )}
      </Match>
      <Match when={props.node.kind === 'message'}>
        <span class="min-w-0 flex-1 truncate text-neutral-500 italic">{props.node.title}</span>
      </Match>
    </Switch>
  );
}

function GroupLabel(props: {
  node: ExplorerTreeGroupNode;
  activateOnSingleClick: boolean | undefined;
  onActivate: ExplorerTreeRowProps['onActivate'];
  onAction: ExplorerTreeRowProps['onAction'];
  onDelete: ExplorerTreeRowProps['onDelete'];
}) {
  return (
    <div
      class="flex min-w-0 flex-1 items-center overflow-hidden font-medium text-neutral-200"
      title={groupTitle(props.node)}
      data-transient-status={props.node.transientStatus}
      style={{ color: props.node.transientStatus ? '#86f98e' : undefined }}
      onClick={(event) => activateWindowOnSingleClick(event, props)}
      onDblClick={(event) => activateGroupOnDoubleClick(event, props)}
    >
      <span class="mr-1 inline-block w-4 flex-none text-center" aria-hidden="true">
        {groupIcon(props.node.groupKind)}
      </span>
      <span class="truncate">{props.node.title}</span>
      <NodeActionButton node={props.node} onAction={props.onAction} />
      <NodeDeleteButton node={props.node} onDelete={props.onDelete} />
    </div>
  );
}

function groupTitle(node: ExplorerTreeGroupNode): string {
  switch (node.transientStatus) {
    case 'recently-saved':
      return `${node.title} · Recently saved by Save All; highlighted until the browser exits`;
    case 'crash-recovered':
      return `${node.title} · Recovered after a crash; highlighted until the browser exits`;
    default:
      return node.title;
  }
}

function activateWindowOnSingleClick(
  event: MouseEvent,
  props: Pick<Parameters<typeof GroupLabel>[0], 'node' | 'activateOnSingleClick' | 'onActivate'>
): void {
  if (
    !props.activateOnSingleClick ||
    event.detail !== 1 ||
    props.node.reference.kind !== 'window' && props.node.reference.kind !== 'saved-window' ||
    event.target instanceof Element && event.target.closest('button')
  ) {
    return;
  }
  props.onActivate?.(props.node, event.altKey);
}

function activateGroupOnDoubleClick(
  event: MouseEvent,
  props: Pick<Parameters<typeof GroupLabel>[0], 'node' | 'activateOnSingleClick' | 'onActivate' | 'onAction'>
): void {
  const windowLike = props.node.reference.kind === 'window' || props.node.reference.kind === 'saved-window';
  if (windowLike && !(event.target instanceof Element && event.target.closest('button'))) {
    if (!props.activateOnSingleClick) {
      event.preventDefault();
      event.stopPropagation();
      props.onActivate?.(props.node, event.altKey);
    }
    return;
  }
  activateOrganizerAction(event, props.node, props.onAction);
}

function LinkLabel(props: {
  node: ExplorerTreeLinkNode;
  appearance: BrowserAtlasAppearanceSettings;
  onLinkClick: ExplorerTreeRowProps['onLinkClick'];
  onAction: ExplorerTreeRowProps['onAction'];
  onDelete: ExplorerTreeRowProps['onDelete'];
}) {
  const content = (
    <>
      <FaviconIcon url={props.node.faviconUrl} />
      <span
        class="truncate"
        classList={{
          'font-bold': props.node.active === true,
          'text-blue-400': props.node.keepOnClose === true
        }}
        style={{ color: explorerLinkTitleColor(props.node, props.appearance) }}
      >
        {props.node.title}
      </span>
    </>
  );

  return (
    <div
      class="flex min-w-0 flex-1 items-center overflow-hidden"
      onDblClick={(event) => activateOrganizerAction(event, props.node, props.onAction)}
    >
      {props.node.url ? (
        <a
          class="flex min-w-0 flex-1 items-center text-neutral-200 hover:bg-neutral-800 hover:text-white"
          href={props.node.url}
          title={props.node.description}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          onClick={(event) => props.onLinkClick?.(props.node, event)}
          onAuxClick={(event) => props.onLinkClick?.(props.node, event)}
        >
          {content}
        </a>
      ) : (
        <span class="flex min-w-0 flex-1 items-center text-neutral-400" title={props.node.description}>
          {content}
        </span>
      )}
      <NodeActionButton node={props.node} onAction={props.onAction} />
      <NodeDeleteButton node={props.node} onDelete={props.onDelete} />
    </div>
  );
}

function explorerLinkTitleColor(
  node: ExplorerTreeLinkNode,
  appearance: BrowserAtlasAppearanceSettings
): string | undefined {
  if (node.keepOnClose === true) {
    return node.reference.kind === 'tab' ? '#4986E7' : '#3460AA';
  }
  if (node.reference.kind === 'tab') {
    if (node.active === true) {
      return appearance.activeTab.enabled ? appearance.activeTab.color : '#eeeeee';
    }
    if (appearance.openTab.enabled) {
      return appearance.openTab.color;
    }
    return appearance.lightBackground ? '#000000' : '#9CB7D3';
  }
  if (node.reference.kind === 'saved-tab') {
    return appearance.savedTab.enabled ? appearance.savedTab.color : '#888888';
  }
  if (isNote(node)) {
    if (appearance.note.enabled) {
      return appearance.note.color;
    }
    return appearance.lightBackground ? '#009C6A' : '#DAD2B4';
  }
  return undefined;
}

function isNote(node: ExplorerTreeLinkNode): boolean {
  return node.reference.kind === 'saved-note' || node.reference.kind === 'document-note';
}

function NodeDeleteButton(props: {
  node: ExplorerTreeGroupNode | ExplorerTreeLinkNode;
  onDelete: ExplorerTreeRowProps['onDelete'];
}) {
  if (!isDeletablePersistentItem(props.node)) {
    return null;
  }
  return (
    <button
      type="button"
      class="h-4 flex-none px-1 leading-4 text-red-500 hover:bg-red-950 hover:text-red-200"
      title={props.node.reference.kind === 'tab' || props.node.reference.kind === 'window'
        ? 'Permanently close this browser item'
        : 'Delete this saved item'}
      aria-label={`Delete ${props.node.title}`}
      draggable={false}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onDelete?.(props.node);
      }}
    >
      ×
    </button>
  );
}

function NodeActionButton(props: {
  node: ExplorerTreeGroupNode | ExplorerTreeLinkNode;
  onAction: ExplorerTreeRowProps['onAction'];
}) {
  const action = () => nodeAction(props.node);
  return (
    <Switch>
      <Match when={action()}>
        {(currentAction) => (
          <button
            type="button"
            class="ml-1 h-4 flex-none px-1 leading-4 text-emerald-400 hover:bg-emerald-950 hover:text-emerald-200"
            title={currentAction().title}
            aria-label={`${currentAction().label} ${props.node.title}`}
            draggable={false}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onAction?.(props.node);
            }}
          >
            {currentAction().icon}
          </button>
        )}
      </Match>
    </Switch>
  );
}

function nodeAction(node: ExplorerTreeGroupNode | ExplorerTreeLinkNode) {
  switch (node.reference.kind) {
    case 'tab':
      return { label: 'Close and save', title: 'Close this tab and keep it in Browser Atlas', icon: '✚' } as const;
    case 'window':
      return {
        label: 'Close and save',
        title: 'Close this window and keep its tabs in Browser Atlas',
        icon: '✚'
      } as const;
    case 'saved-tab':
      return { label: 'Restore', title: 'Restore this saved tab', icon: '↗' } as const;
    case 'saved-window':
      return { label: 'Restore', title: 'Restore this saved window', icon: '↗' } as const;
    case 'saved-group':
      return { label: 'Edit', title: 'Rename this saved group', icon: '✎' } as const;
    case 'saved-note':
      return { label: 'Edit', title: 'Edit this saved note', icon: '✎' } as const;
    case 'saved-separator':
      return { label: 'Change style', title: 'Cycle separator style', icon: '◫' } as const;
    default:
      return undefined;
  }
}

function isSavedOrganizer(node: ExplorerTreeGroupNode | ExplorerTreeLinkNode): boolean {
  return (
    node.reference.kind === 'saved-group' ||
    node.reference.kind === 'saved-note' ||
    node.reference.kind === 'saved-separator'
  );
}

function isDeletablePersistentItem(node: ExplorerTreeGroupNode | ExplorerTreeLinkNode): boolean {
  return node.reference.kind === 'tab' ||
    node.reference.kind === 'window' ||
    node.reference.kind.startsWith('saved-');
}

function activateOrganizerAction(
  event: MouseEvent,
  node: ExplorerTreeGroupNode | ExplorerTreeLinkNode,
  onAction: ExplorerTreeRowProps['onAction']
): void {
  if (!isSavedOrganizer(node) || (event.target instanceof Element && event.target.closest('button'))) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onAction?.(node);
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
    case 'group':
      return '◆';
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

const faviconLoaders = new Map<Element, () => void>();
const FAVICON_LOAD_MARGIN = 160;
let faviconObserver: IntersectionObserver | undefined;
