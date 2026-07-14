import { createEditorRegistries } from '../../../editor/contributions';
import type { EditorContribution, ToolContribution } from '../../../editor/kernel';
import type { ViewportTool } from './toolRegistry';
import { createElementHandleTool } from './elementHandleTool';
import { createSelectionTool } from './selectionTool';
import { createTouchTool } from './touchTool';
import { createTransformBoxTool } from './transformBoxTool';
import { createViewNavigationTool } from './viewNavigationTool';
import type { DefaultViewportToolContext } from './defaultViewportToolContext';

export type { DefaultViewportToolContext } from './defaultViewportToolContext';

export type ViewportToolContribution = ToolContribution & {
  readonly createTool: (context: DefaultViewportToolContext) => ViewportTool;
};

export type ViewportToolRegistryContribution = EditorContribution & {
  readonly tools?: readonly ViewportToolContribution[];
};

export const coreViewportToolContribution = {
  id: 'core.viewport-tools',
  tools: [
    viewportToolContribution('touch', 'Touch gestures', 100, createTouchTool),
    viewportToolContribution('view-navigation', 'View navigation', 90, createViewNavigationTool),
    viewportToolContribution('element-handle', 'Element handles', 80, createElementHandleTool),
    viewportToolContribution('transform-box', 'Transform box', 80, createTransformBoxTool),
    viewportToolContribution('selection', 'Selection', 10, createSelectionTool)
  ]
} as const satisfies ViewportToolRegistryContribution;

export function createDefaultViewportTools(context: DefaultViewportToolContext): readonly ViewportTool[] {
  return createViewportToolsFromContributions(context);
}

export function createViewportToolsFromContributions(
  context: DefaultViewportToolContext,
  contributions: readonly ViewportToolRegistryContribution[] = [coreViewportToolContribution]
): readonly ViewportTool[] {
  const registries = createEditorRegistries(contributions);
  return createViewportToolsFromRegistry(context, registries.tools);
}

export function createViewportToolsFromRegistry(
  context: DefaultViewportToolContext,
  tools: readonly ToolContribution[]
): readonly ViewportTool[] {
  return tools.filter(isViewportToolContribution).map((tool) => tool.createTool(context));
}

function viewportToolContribution(
  id: ViewportTool['id'],
  label: string,
  priority: number,
  createTool: (context: DefaultViewportToolContext) => ViewportTool
): ViewportToolContribution {
  return { id, label, priority, createTool };
}

function isViewportToolContribution(tool: ToolContribution): tool is ViewportToolContribution {
  const candidate = tool as { readonly createTool?: unknown };
  return typeof candidate.createTool === 'function';
}
