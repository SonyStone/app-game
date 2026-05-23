import type { MarkdownExit } from 'markdown-exit';
import type { MarkdownComponentNode } from './markdownComponentPlugin';

export type MarkdownToken = ReturnType<MarkdownExit['parse']>[number];

export type MarkdownNodePluginContext = {
  renderer: MarkdownExit;
};

export type MarkdownNodePlugin = {
  resolveNodes: (
    token: MarkdownToken,
    context: MarkdownNodePluginContext
  ) => Promise<MarkdownComponentNode[] | undefined> | MarkdownComponentNode[] | undefined;
};

export type MarkdownModulePlugin = {
  renderModule: (options: { nodes: MarkdownComponentNode[] }) => string;
};
