import { createMemoCache } from '@solid-primitives/memo';
import { createMemo, type Accessor } from 'solid-js';

import { svgCapabilities, type SvgCapabilityRegistry } from '../../editor/capabilities';
import type { PathAnchorSelection, SelectionTarget } from '../../editor/selection-targets';
import type { ActiveDrag, AppSettings, HandleDescriptor } from '../../editor/types';
import { humanFileSize, serializeRoot } from '../../formatter';
import { flattenElements, type SvgElementNode } from '../../svg-model';
import type { TouchGesture } from '../viewport/touch-gesture';
import { createRasterPreview } from '../viewport/createRasterPreview';
import { createRasterPreviewRect, createRasterPreviewRoot, type SvgSize } from '../viewport/viewport-math';

export function createEditorDerivedState(options: {
  readonly settings: Accessor<AppSettings>;
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedPathAnchor: Accessor<PathAnchorSelection | undefined>;
  readonly activeDrag: Accessor<ActiveDrag | undefined>;
  readonly activeTouchGesture: Accessor<TouchGesture | undefined>;
  readonly transientViewportPreview: Accessor<boolean>;
  readonly rootSize: Accessor<SvgSize>;
  readonly capabilities?: SvgCapabilityRegistry;
}) {
  const capabilities = options.capabilities ?? svgCapabilities;

  const handleDragActive = createMemo(
    () =>
      options.activeDrag()?.type === 'handle' ||
      options.activeDrag()?.type === 'transform-box' ||
      options.activeDrag()?.type === 'move-selection'
  );

  const exportText = createMemo<string>((previous) => {
    if (handleDragActive() && previous) {
      return previous;
    }

    return serializeRoot(options.activeRoot(), options.settings().exportFormatter);
  }, '');

  const fileSize = createMemo(() => humanFileSize(new Blob([exportText()]).size));
  const elementCount = createMemo(() => flattenElements(options.activeRoot()).length);
  const selectedHandleNodeIds = createMemo(() => {
    const anchor = options.selectedPathAnchor();
    return anchor ? [anchor.nodeId] : options.selectedIds();
  });
  const handlesForSelection = createMemoCache(
    () => {
      const selectedIds = selectedHandleNodeIds();
      return selectedIds.length <= 1 ? capabilities.getHandles(options.activeRoot(), selectedIds) : [];
    },
    { size: 64 }
  );
  const handles = createMemo(() => markActivePathAnchorHandle(handlesForSelection(selectedHandleNodeIds().join('\u001f')), options.selectedPathAnchor()));

  const viewportIsMoving = createMemo(
    () =>
      options.activeDrag()?.type === 'pan' ||
      options.activeDrag()?.type === 'rotate-canvas' ||
      options.activeDrag()?.type === 'move-selection' ||
      Boolean(options.activeTouchGesture()) ||
      options.transientViewportPreview()
  );

  const useRasterPreview = createMemo(
    () => options.settings().viewRasterized || (options.settings().rasterPreviewDuringInteraction && viewportIsMoving())
  );

  const rasterPreviewRect = createMemo(() => createRasterPreviewRect(options.rootSize()));
  const rasterPreviewText = createMemo(() =>
    serializeRoot(createRasterPreviewRoot(options.activeRoot(), rasterPreviewRect()), options.settings().exportFormatter)
  );
  const rasterPreviewUrl = createRasterPreview({ enabled: useRasterPreview, text: rasterPreviewText });

  return {
    exportText,
    fileSize,
    elementCount,
    handles,
    viewportIsMoving,
    useRasterPreview,
    rasterPreviewRect,
    rasterPreviewUrl
  };
}

function markActivePathAnchorHandle(
  handles: readonly HandleDescriptor[],
  anchor: PathAnchorSelection | undefined
): readonly HandleDescriptor[] {
  if (!anchor) {
    return handles;
  }

  let changed = false;
  const next = handles.map((handle) => {
    const active = handle.selectionTargets?.some((target) => pathAnchorMatchesTarget(anchor, target)) ?? false;

    if (!active) {
      return handle;
    }

    changed = true;
    return { ...handle, active } satisfies HandleDescriptor;
  });

  return changed ? next : handles;
}

function pathAnchorMatchesTarget(anchor: PathAnchorSelection, target: SelectionTarget): boolean {
  return (
    target.kind === 'path-anchor' &&
    target.nodeId === anchor.nodeId &&
    target.commandIndex === anchor.commandIndex &&
    target.parameter === anchor.parameter
  );
}
