import { createSignal } from 'solid-js';

/** Creates headless native drag-and-drop behavior for arbitrary tree items and targets. */
export function createTreeDragAndDrop<TNode, TItem, TTarget>(props: {
  /** MIME type used to exchange serialized items between compatible tree views. */
  dataType: string;
  /** Creates a draggable payload, or `null` when the node is not draggable. */
  createItem: (node: TNode) => TItem | null;
  /** Cheap eligibility check used while rows render. Defaults to calling `createItem`. */
  canDrag?: (node: TNode) => boolean;
  /** Returns the plain-text label shared with native drag destinations. */
  getItemLabel: (item: TItem) => string;
  /** Serializes a payload for compatible tree views. */
  serializeItem: (item: TItem) => string;
  /** Parses a serialized payload, returning `null` when it is invalid. */
  parseItem: (serialized: string) => TItem | null;
  /** Additional MIME types that may contain a compatible cross-application payload. */
  additionalDataTypes?: readonly string[];
  /** Optionally writes interoperable representations and returns cleanup for temporary resources. */
  writeItem?: (dataTransfer: DataTransfer, item: TItem, serializedItem: string) => void | (() => void);
  /** Optionally reads an item from interoperable MIME representations. */
  readItem?: (dataTransfer: DataTransfer) => TItem | null;
  /** Resolves a semantic target from the hovered node and vertical pointer ratio. */
  resolveTarget: (node: TNode, pointerRatio: number) => TTarget | null;
  /** Determines whether the payload may be applied to the target. */
  canDrop: (item: TItem, target: TTarget) => boolean;
  /** Determines whether the operation copies or moves the source, including active keyboard modifiers. */
  getDropEffect: (item: TItem, target: TTarget, modifiers: TreeDragModifiers) => TreeDropEffect;
  /** Returns the target placement rendered by an optional drop indicator. */
  getPlacement: (target: TTarget) => TreeDropPlacement;
  /** Executes an accepted semantic drop using the effect displayed during the gesture. */
  onDrop: (item: TItem, target: TTarget, effect: TreeDropEffect) => Promise<void>;
  /** Converts an execution failure into caller-facing text. */
  formatError?: (reason: unknown) => string;
}) {
  let dragItem: TItem | null = null;
  let dragSourceElement: HTMLElement | null = null;
  let releaseWrittenItem: (() => void) | null = null;
  let pendingFeedback: TreeDropFeedbackState | null = null;
  let feedbackFrame: number | null = null;
  const compatibleDataTypes = new Set([props.dataType, ...(props.additionalDataTypes ?? [])]);
  const [feedback, setFeedback] = createSignal<TreeDropFeedbackState | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [dropping, setDropping] = createSignal(false);

  return {
    /** Native event properties for a rendered tree row. */
    rowProps(node: TNode) {
      const draggable = props.canDrag?.(node) ?? props.createItem(node) !== null;

      return {
        ...createDragSourceProps(() => props.createItem(node), draggable),
        ...createDropZoneProps(node)
      } as const;
    },
    /** Native drag properties for a non-tree handle that creates or supplies an item. */
    dragSourceProps(item: TItem) {
      return createDragSourceProps(() => item, true);
    },
    /** Native event properties for a drop-only surface such as empty tree space. */
    dropZoneProps(node: TNode) {
      return createDropZoneProps(node);
    },
    /** Whether a node can initiate a drag gesture. */
    canDrag(node: TNode): boolean {
      return props.canDrag?.(node) ?? props.createItem(node) !== null;
    },
    feedback,
    error,
    dropping,
    /** Clears the current operation error. */
    dismissError(): void {
      setError(null);
    }
  } as const;

  function createDropZoneProps(node: TNode) {
    return {
      onDragEnter(event: TreeDragEvent) {
        updateDropTarget(event, node);
      },
      onDragOver(event: TreeDragEvent) {
        updateDropTarget(event, node);
      },
      onDragLeave(event: TreeDragEvent) {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          scheduleFeedback(null);
        }
      },
      onDrop(event: TreeDragEvent) {
        const itemToDrop = dragItem ?? readItem(event.dataTransfer);
        const target = itemToDrop
          ? props.resolveTarget(node, pointerPosition(event, readRect(event.currentTarget)))
          : null;
        if (!itemToDrop || !target || !props.canDrop(itemToDrop, target)) {
          if (event.dataTransfer && hasCompatibleData(event.dataTransfer)) {
            event.preventDefault();
            event.stopPropagation();
          }
          clearDragState();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const effect = dragItem ? props.getDropEffect(itemToDrop, target, dragModifiers(event)) : 'copy';
        clearDragState();
        setDropping(true);

        void props
          .onDrop(itemToDrop, target, effect)
          .catch((reason: unknown) => setError(props.formatError?.(reason) ?? formatError(reason)))
          .finally(() => setDropping(false));
      }
    } as const;
  }

  function createDragSourceProps(readDragItem: () => TItem | null, draggable: boolean) {
    return {
      draggable: draggable ? 'true' : 'false',
      onDragStart(event: TreeDragEvent) {
        const item = readDragItem();
        if (!item || !event.dataTransfer) {
          event.preventDefault();
          return;
        }

        setError(null);
        clearDragState();
        dragItem = item;
        dragSourceElement = event.currentTarget;
        dragSourceElement.classList.add('opacity-40');
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'copyMove';
        setCompactDragImage(event.dataTransfer, props.getItemLabel(item));
        const serializedItem = props.serializeItem(item);
        setDataSafely(event.dataTransfer, props.dataType, serializedItem);
        setDataSafely(event.dataTransfer, 'text/plain', props.getItemLabel(item));
        releaseWrittenItem = props.writeItem?.(event.dataTransfer, item, serializedItem) ?? null;
      },
      onDragEnd() {
        clearDragState();
      }
    } as const;
  }

  function updateDropTarget(event: TreeDragEvent, node: TNode): void {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      scheduleFeedback(null);
      return;
    }

    const rect = readRect(event.currentTarget);
    const target = props.resolveTarget(node, pointerPosition(event, rect));
    if (!dragItem) {
      if (target && hasCompatibleData(dataTransfer)) {
        event.preventDefault();
        event.stopPropagation();
        dataTransfer.dropEffect = 'copy';
        scheduleFeedback({ rect, placement: props.getPlacement(target), effect: 'drop' });
        return;
      }
      dataTransfer.dropEffect = 'none';
      scheduleFeedback(null);
      return;
    }

    if (!target || !props.canDrop(dragItem, target)) {
      dataTransfer.dropEffect = 'none';
      scheduleFeedback(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const effect = props.getDropEffect(dragItem, target, dragModifiers(event));
    dataTransfer.dropEffect = effect;
    scheduleFeedback({ rect, placement: props.getPlacement(target), effect });
  }

  function hasCompatibleData(dataTransfer: DataTransfer): boolean {
    return [...dataTransfer.types].some((type) => compatibleDataTypes.has(type));
  }

  function readItem(dataTransfer: DataTransfer | null): TItem | null {
    const serialized = dataTransfer?.getData(props.dataType);
    if (serialized) {
      return props.parseItem(serialized);
    }
    return dataTransfer ? (props.readItem?.(dataTransfer) ?? null) : null;
  }

  function clearDragState(): void {
    dragItem = null;
    releaseWrittenItem?.();
    releaseWrittenItem = null;
    clearDragSource();
    clearFeedback();
  }

  function clearDragSource(): void {
    dragSourceElement?.classList.remove('opacity-40');
    dragSourceElement = null;
  }

  function scheduleFeedback(nextFeedback: TreeDropFeedbackState | null): void {
    pendingFeedback = nextFeedback;
    if (feedbackFrame !== null) {
      return;
    }
    feedbackFrame = requestAnimationFrame(() => {
      feedbackFrame = null;
      setFeedback((currentFeedback) =>
        equalDropFeedback(currentFeedback, pendingFeedback) ? currentFeedback : pendingFeedback
      );
    });
  }

  function clearFeedback(): void {
    if (feedbackFrame !== null) {
      cancelAnimationFrame(feedbackFrame);
      feedbackFrame = null;
    }
    pendingFeedback = null;
    setFeedback(null);
  }
}

/** Modifier state that may change the semantic effect during one native drag gesture. */
export type TreeDragModifiers = Readonly<{
  copyRequested: boolean;
}>;

/** Visual placement emitted by headless drag-and-drop behavior. */
export type TreeDropPlacement = 'before' | 'inside' | 'after';

/** Native semantic effect emitted by headless drag-and-drop behavior. */
export type TreeDropEffect = 'copy' | 'move';

/** Optional visual state for rendering an active tree drop location. */
export type TreeDropFeedbackState = Readonly<{
  /** Viewport-relative bounds of the active row. */
  rect: { top: number; left: number; width: number; height: number };
  /** Whether the item will be inserted beside or inside the row. */
  placement: TreeDropPlacement;
  /** Confirmed copy/move effect, or `drop` while another page withholds its payload until release. */
  effect: TreeDropEffect | 'drop';
}>;

type TreeDragEvent = globalThis.DragEvent & {
  currentTarget: HTMLElement;
  target: Element;
};

function pointerPosition(event: TreeDragEvent, rect: TreeDropFeedbackState['rect']): number {
  return rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
}

function dragModifiers(event: TreeDragEvent): TreeDragModifiers {
  return { copyRequested: event.altKey || event.ctrlKey || event.metaKey };
}

function readRect(element: HTMLElement): TreeDropFeedbackState['rect'] {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function equalDropFeedback(left: TreeDropFeedbackState | null, right: TreeDropFeedbackState | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.placement === right.placement &&
      left.effect === right.effect &&
      left.rect.top === right.rect.top &&
      left.rect.left === right.rect.left &&
      left.rect.width === right.rect.width &&
      left.rect.height === right.rect.height)
  );
}

function formatError(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The drop operation could not be completed.';
}

function setDataSafely(dataTransfer: DataTransfer, type: string, value: string): void {
  try {
    dataTransfer.setData(type, value);
  } catch {
    // Some browsers impose implementation-specific limits on individual drag representations.
  }
}

function setCompactDragImage(dataTransfer: DataTransfer, label: string): void {
  const preview = document.createElement('div');
  preview.textContent = label;
  Object.assign(preview.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    maxWidth: '280px',
    overflow: 'hidden',
    padding: '3px 7px',
    border: '1px solid #60a5fa',
    borderRadius: '3px',
    background: '#171717',
    color: '#f5f5f5',
    font: '12px system-ui, sans-serif',
    lineHeight: '16px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    pointerEvents: 'none'
  });
  document.body.append(preview);
  dataTransfer.setDragImage(preview, 12, 12);
  setTimeout(() => preview.remove(), 0);
}
