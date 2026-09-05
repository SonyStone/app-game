import type { JSX } from '@solidjs/web';
import { ThreeExamplesStateDiagram } from './three-examples-state-diagram';

/** Interactive route for inspecting the official Three.js WebGL examples. */
export default function WebGLStateDiagramDemo(): JSX.Element {
  return <ThreeExamplesStateDiagram />;
}

export {
  getRawWebGLContext,
  getWebGLInspector,
  installWebGLContextHook,
  instrumentWebGLContext,
  WebGLInspector
} from './gl-debug-wrapper';
export type {
  InstrumentedWebGLContext,
  WebGLCallSnapshot,
  WebGLContext,
  WebGLContextHook,
  WebGLIndexedBufferBindingSnapshot,
  WebGLInspectorOptions,
  WebGLResourceKind,
  WebGLResourceRelationSnapshot,
  WebGLResourceSnapshot,
  WebGLStateGroup,
  WebGLStateRow,
  WebGLStateSnapshot,
  WebGLTextureUnitSnapshot,
  WebGLVertexAttributeSnapshot
} from './gl-debug-wrapper';
export { helpTopicForResource, helpTopicForState, WEBGL_HELP } from './help-content';
export type { WebGLHelpArticle, WebGLHelpSection, WebGLHelpTopic } from './help-content';
export { WebGLIframeStateDiagram } from './iframe-state-diagram';
export type {
  WebGLIframeApplicationContext,
  WebGLIframeInitializer,
  WebGLIframeSource,
  WebGLIframeStateDiagramProps
} from './iframe-state-diagram';
export { WebGLStateDiagram } from './state-diagram';
export { ThreeExamplesStateDiagram } from './three-examples-state-diagram';
