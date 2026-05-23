import { createShikiRenderer, normalizeShikiLanguage, type ShikiRendererOptions } from '@app-game/vite-plugin-shiki';
import type { MarkdownComponentNode } from './markdownComponentPlugin';
import type { MarkdownNodePlugin } from './markdownPipeline';

export type MarkdownShikiPluginOptions = ShikiRendererOptions & {
  theme?: string;
};

export function createMarkdownShikiPlugin(options: MarkdownShikiPluginOptions = {}): MarkdownNodePlugin {
  const shikiRenderer = createShikiRenderer({
    themes: options.themes,
    supportedLanguages: options.supportedLanguages,
    defaultLanguage: options.defaultLanguage
  });

  return {
    async resolveNodes(token) {
      if (token.type !== 'fence' && token.type !== 'code_block') {
        return undefined;
      }

      return [await createCodeBlockNode(token, shikiRenderer, options.theme)];
    }
  };
}

async function createCodeBlockNode(
  token: {
    content: string;
    info: string;
  },
  shikiRenderer: ReturnType<typeof createShikiRenderer>,
  theme?: string
): Promise<MarkdownComponentNode> {
  const [rawLanguage = '', ...metaParts] = token.info.trim().split(/\s+/).filter(Boolean);
  const language = normalizeShikiLanguage(rawLanguage) ?? (rawLanguage || undefined);
  const meta = metaParts.length > 0 ? metaParts.join(' ') : undefined;
  const result = await shikiRenderer.highlight(token.content, {
    language,
    theme
  });

  return {
    type: 'codeblock',
    code: token.content,
    language: result.language,
    meta,
    html: result.html,
    title: extractTitleFromMeta(meta)
  };
}

function extractTitleFromMeta(meta?: string): string | undefined {
  if (!meta) {
    return undefined;
  }

  const quotedTitle = /(?:^|\s)title=(?:"([^"]+)"|'([^']+)')/.exec(meta);

  if (quotedTitle) {
    return quotedTitle[1] ?? quotedTitle[2];
  }

  const bareTitle = /(?:^|\s)title=([^\s]+)/.exec(meta);

  return bareTitle?.[1];
}
