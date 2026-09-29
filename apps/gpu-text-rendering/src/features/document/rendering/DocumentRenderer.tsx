import type { JSX } from '@solidjs/web';
import { createContext, Show, useContext } from 'solid-js';
import type { ViewerError } from '../../../shared/errors';
import { TokenContext } from '../../../shared/jsx/TokenContext';
import type { DocumentCamera } from '../../camera/createDocumentCamera';
import type { TextDocument } from '../document';
import type { SceneFrame } from './createFrame';

/**
 * Starts a drawing session for one document: children choose its engine, GlyphText or VectorArtwork, which prepares
 * the document on the GPU and draws it through `camera`. Replacing the document remounts the children, disposing the
 * previous renderer. Mount beneath FrameLoop; children preserve their draw order in the scene.
 */
export function DocumentRenderer(props: {
  document: TextDocument;
  /** Camera read on every draw; fixed for the session. */
  camera: DocumentCamera;
  /** Initial pages to prepare. 'viewport' captures the camera and viewport once; omit to prewarm all pages. */
  initialFrame?: SceneFrame | 'viewport';
  /** Called once per failed document; its engine then draws nothing. */
  onError: (error: ViewerError) => void;
  /** Reports residency changes as visible images enter or leave the GPU cache. */
  onResourceUsage?: (bytes: number) => void;
  /** Called once when preparation succeeds, with its duration and estimated GPU bytes. */
  onReady?: (info: { preparationMs: number; resourceBytes: number }) => void;
  /** The document's engine. */
  children: JSX.Element;
}) {
  return (
    <Show when={props.document} keyed>
      {(document) => (
        <TokenContext
          context={DocumentRendererContext}
          value={{
            document,
            camera: props.camera,
            initialFrame: () => props.initialFrame,
            reportError: (error) => props.onError(error),
            reportResourceUsage: (bytes) => props.onResourceUsage?.(bytes),
            reportReady: (info) => props.onReady?.(info)
          }}
        >
          {props.children}
        </TokenContext>
      )}
    </Show>
  );
}

/** Reads the session beneath DocumentRenderer. A missing DocumentRenderer is a programming error. */
export function useDocumentRenderer() {
  return useContext(DocumentRendererContext);
}

const DocumentRendererContext = createContext<{
  /** The session's document; fixed, since a replacement starts a new session. */
  document: TextDocument;
  camera: DocumentCamera;
  initialFrame: () => SceneFrame | 'viewport' | undefined;
  reportError: (error: ViewerError) => void;
  reportResourceUsage: (bytes: number) => void;
  reportReady: (info: { preparationMs: number; resourceBytes: number }) => void;
}>();
