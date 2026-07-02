import { createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';

import { estimateInspectorRowHeight, flattenInspectorRows } from '../../editor/tree-utils';
import type { InspectorRow, VirtualInspectorRow } from '../../editor/types';
import type { SvgElementNode, SvgNode } from '../../svg-model';

type VisibleInspectorWindow = {
  readonly rows: readonly VirtualInspectorRow[];
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly totalHeight: number;
};

const emptyInspectorRows: readonly InspectorRow[] = [];

export function createInspectorVirtualScroll(props: { readonly root: () => SvgElementNode }) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [heightVersion, setHeightVersion] = createSignal(0);
  const rowHeights = new Map<string, number>();
  const estimatedRowHeights = new Map<string, { readonly node: SvgNode; readonly height: number }>();
  const virtualRowCache = new Map<string, VirtualInspectorRow>();
  let scrollerRef: HTMLDivElement | undefined;
  let virtualSpacerRef: HTMLDivElement | undefined;

  const rows = createMemo(
    (previous: readonly InspectorRow[] | undefined) => flattenInspectorRows(props.root(), previous),
    emptyInspectorRows
  );
  const virtualLayout = createMemo(() => {
    heightVersion();
    const currentRows = rows();
    const tops: number[] = [];
    const heights: number[] = [];
    let totalHeight = 0;

    for (const row of currentRows) {
      const height = rowHeights.get(row.node.id) ?? cachedEstimatedRowHeight(row.node);
      tops.push(totalHeight);
      heights.push(height);
      totalHeight += height + 4;
    }

    return { rows: currentRows, tops, heights, totalHeight };
  });
  const visibleWindow = createMemo((): VisibleInspectorWindow => {
    const layout = virtualLayout();
    const virtualTop = Math.max(0, scrollTop() - (virtualSpacerRef?.offsetTop ?? 0));
    const startY = Math.max(0, virtualTop - 900);
    const endY = virtualTop + viewportHeight() + 900;
    let startIndex = 0;
    let endIndex = layout.rows.length;

    for (let index = 0; index < layout.rows.length; index += 1) {
      const top = layout.tops[index] ?? 0;
      const height = layout.heights[index] ?? 0;

      if (top + height >= startY) {
        startIndex = index;
        break;
      }
    }

    for (let index = startIndex; index < layout.rows.length; index += 1) {
      const top = layout.tops[index] ?? 0;

      if (top > endY) {
        endIndex = index + 1;
        break;
      }
    }

    const topAfterEnd =
      endIndex >= layout.rows.length ? layout.totalHeight : (layout.tops[endIndex] ?? layout.totalHeight);
    const activeIds = new Set(layout.rows.map((row) => row.node.id));
    const visibleRows = layout.rows.slice(startIndex, endIndex).map((row, offset) => {
      const index = startIndex + offset;
      const top = layout.tops[index] ?? 0;
      const cached = virtualRowCache.get(row.node.id);

      if (
        cached &&
        cached.node === row.node &&
        cached.depth === row.depth &&
        cached.index === index &&
        cached.top === top
      ) {
        return cached;
      }

      const next = { ...row, index, top } satisfies VirtualInspectorRow;
      virtualRowCache.set(row.node.id, next);
      return next;
    });

    for (const id of virtualRowCache.keys()) {
      if (!activeIds.has(id)) {
        virtualRowCache.delete(id);
      }
    }

    for (const id of estimatedRowHeights.keys()) {
      if (!activeIds.has(id)) {
        estimatedRowHeights.delete(id);
      }
    }

    return {
      rows: visibleRows,
      paddingTop: layout.tops[startIndex] ?? 0,
      paddingBottom: Math.max(0, layout.totalHeight - topAfterEnd),
      totalHeight: layout.totalHeight
    };
  });
  const virtualSpacerHeight = createMemo(() => visibleWindow().totalHeight + Math.max(0, viewportHeight() - 24));

  onMount(() => {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    let resizeFrame: number | undefined;
    const scheduleViewportMeasure = () => {
      if (resizeFrame !== undefined) {
        return;
      }

      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = undefined;
        setViewportHeight(scroller.clientHeight);
      });
    };

    setViewportHeight(scroller.clientHeight);
    const observer = new ResizeObserver(scheduleViewportMeasure);
    observer.observe(scroller);
    onCleanup(() => {
      observer.disconnect();

      if (resizeFrame !== undefined) {
        cancelAnimationFrame(resizeFrame);
      }
    });
  });

  function setScrollerRef(element: HTMLDivElement): void {
    scrollerRef = element;
  }

  function setVirtualSpacerRef(element: HTMLDivElement): void {
    virtualSpacerRef = element;
  }

  function measureRow(id: string, height: number): void {
    if (Math.abs((rowHeights.get(id) ?? 0) - height) < 1) {
      return;
    }

    rowHeights.set(id, height);
    estimatedRowHeights.delete(id);
    setHeightVersion((version) => version + 1);
  }

  function cachedEstimatedRowHeight(node: SvgNode): number {
    const cached = estimatedRowHeights.get(node.id);

    if (cached?.node === node) {
      return cached.height;
    }

    const height = estimateInspectorRowHeight(node);
    estimatedRowHeights.set(node.id, { node, height });
    return height;
  }

  function scrollRowToTop(id: string): void {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    if (id === props.root().id) {
      scroller.scrollTo({ top: 0 });
      setScrollTop(0);
      return;
    }

    const layout = virtualLayout();
    let rowIndex = layout.rows.findIndex((row) => row.node.id === id);

    if (rowIndex === -1) {
      rowIndex = layout.rows.findIndex((row) => row.node.kind === 'element' && nodeContainsId(row.node, id));
    }

    if (rowIndex === -1) {
      return;
    }

    const rowTop = layout.tops[rowIndex] ?? 0;
    const spacerTop = virtualSpacerRef?.offsetTop ?? 0;
    const nextScrollTop = Math.max(0, spacerTop + rowTop);
    const currentScrollTop = scroller.scrollTop;

    if (Math.abs(nextScrollTop - currentScrollTop) < 1) {
      return;
    }

    scroller.scrollTo({ top: nextScrollTop });
    setScrollTop(nextScrollTop);
  }

  function alignMountedRowToTop(id: string): void {
    const scroller = scrollerRef;

    if (!scroller) {
      return;
    }

    const card = findMountedInspectorCard(scroller, id);

    if (!card) {
      return;
    }

    const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

    if (Math.abs(offset) < 1) {
      return;
    }

    const nextScrollTop = Math.max(0, scroller.scrollTop + offset);

    if (Math.abs(nextScrollTop - scroller.scrollTop) < 1) {
      return;
    }

    scroller.scrollTo({ top: nextScrollTop });
    setScrollTop(nextScrollTop);
  }

  return {
    visibleWindow,
    virtualSpacerHeight,
    setScrollerRef,
    setVirtualSpacerRef,
    setScrollTop,
    measureRow,
    scrollRowToTop,
    alignMountedRowToTop
  };
}

export function VirtualInspectorRowShell(props: {
  readonly row: VirtualInspectorRow;
  readonly measureRow: (id: string, height: number) => void;
  readonly children: JSX.Element;
}) {
  let rowRef: HTMLDivElement | undefined;
  let measureFrame: number | undefined;
  const measure = () => {
    const element = rowRef;

    if (element) {
      props.measureRow(props.row.node.id, element.offsetHeight);
    }
  };
  const scheduleMeasure = () => {
    if (measureFrame !== undefined) {
      return;
    }

    measureFrame = requestAnimationFrame(() => {
      measureFrame = undefined;
      measure();
    });
  };

  onMount(() => {
    const element = rowRef;

    if (!element) {
      return;
    }

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(element);
    onCleanup(() => {
      observer.disconnect();

      if (measureFrame !== undefined) {
        cancelAnimationFrame(measureFrame);
      }
    });
  });

  createEffect(() => {
    props.row.node.id;
    queueMicrotask(scheduleMeasure);
  });

  return (
    <div
      ref={(element) => (rowRef = element)}
      class="pr-0.75 [overflow-anchor:none]"
      data-testid={`inspector-virtual-row-${props.row.node.id}`}
      style={{
        'padding-left': `${Math.min(props.row.depth * 12, 144)}px`
      }}
    >
      {props.children}
    </div>
  );
}

export function nodeContainsId(node: SvgNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }

  if (node.kind !== 'element') {
    return false;
  }

  return node.children.some((child) => nodeContainsId(child, id));
}

function findMountedInspectorCard(scroller: HTMLElement, id: string): HTMLElement | undefined {
  for (const element of scroller.querySelectorAll<HTMLElement>('[data-inspector-node-id]')) {
    if (element.dataset.inspectorNodeId === id) {
      return element;
    }
  }

  return undefined;
}
