import type { JSX } from '@solidjs/web';
import { createMemo } from 'solid-js';
import { pageRect, pageToWorld, worldToPage } from '../../camera/camera';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import { makeDocumentSpace } from '../../camera/DocumentSpace';
import { SceneSpaceProvider, type SceneSpace } from '../../scene/SceneSpace';
import { useViewport } from '../../viewport/createViewport';
import { useDocumentRenderer } from './DocumentRenderer';

/**
 * Places descendant graphics on one page of the session's document, in PDF points with the origin at the page's
 * top-left corner and y pointing down. Draws nothing itself: the engine keeps drawing every page in one batch, so a
 * Page costs no GPU work. Mount beneath DocumentRenderer and FrameLoop; graphics follow the camera and any change of
 * `index`.
 */
export function Page(props: {
  /** Camera of this canvas, the same one its document view draws with; fixed for the page's lifetime. */
  camera: DocumentCamera;
  /** Zero-based page index; a missing page throws a RangeError. */
  index: number;
  children: JSX.Element;
}) {
  const { document } = useDocumentRenderer();
  const world = makeDocumentSpace(props.camera, useViewport());
  const placement = createMemo(() => ({
    rect: pageRect(document.pages, props.index),
    size: document.pages[props.index]!
  }));

  const space: SceneSpace = {
    toScreen: (point) => world.toScreen(pageToWorld(placement(), point)),
    fromScreen: (point) => worldToPage(placement(), world.fromScreen(point)),
    toClip: (point) => world.toClip(pageToWorld(placement(), point))
  };

  return <SceneSpaceProvider space={space}>{props.children}</SceneSpaceProvider>;
}
