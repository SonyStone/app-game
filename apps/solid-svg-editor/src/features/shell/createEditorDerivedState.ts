import { createMemoCache } from '@solid-primitives/memo';
import { createMemo, type Accessor } from 'solid-js';

import { svgCapabilities } from '../../editor/capabilities';
import type { ActiveDrag, AppSettings } from '../../editor/types';
import { humanFileSize, serializeRoot } from '../../formatter';
import { flattenElements, type SvgElementNode } from '../../svg-model';
import { createRasterPreview } from '../viewport/createRasterPreview';
import type { TouchGesture } from '../viewport/touch-gesture';
import { createRasterPreviewRect, createRasterPreviewRoot, type SvgSize } from '../viewport/viewport-math';

export function createEditorDerivedState(options: {
  readonly settings: Accessor<AppSettings>;
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly activeDrag: Accessor<ActiveDrag | undefined>;
  readonly activeTouchGesture: Accessor<TouchGesture | undefined>;
  readonly transientViewportPreview: Accessor<boolean>;
  readonly rootSize: Accessor<SvgSize>;
}) {
  const handleDragActive = createMemo(
    () =>
      options.activeDrag()?.type === 'handle' ||
      options.activeDrag()?.type === 'transform-box' ||
      options.activeDrag()?.type === 'move-selection'
  );

  const exportText = createMemo<string>(
    (previous) => {
      if (handleDragActive() && previous) {
        return previous;
      }

      return serializeRoot(options.activeRoot(), options.settings().exportFormatter);
    },
    { loadingValue: '' }
  );

  const fileSize = createMemo(() => humanFileSize(new Blob([exportText()]).size));
  const elementCount = createMemo(() => flattenElements(options.activeRoot()).length);
  const handlesForSelection = createMemoCache(
    () => {
      const selectedIds = options.selectedIds();
      return selectedIds.length <= 1 ? svgCapabilities.getHandles(options.activeRoot(), selectedIds) : [];
    },
    { size: 64 }
  );
  const handles = createMemo(() => handlesForSelection(options.selectedIds().join('\u001f')));

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
    serializeRoot(
      createRasterPreviewRoot(options.activeRoot(), rasterPreviewRect()),
      options.settings().exportFormatter
    )
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
