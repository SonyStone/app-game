// The layout variant: pages built in the component canvas's constructor, each a variant over the drawing session.
import type { PaintVariant } from '..';
import { layoutId, parsePageLayout, type PageLayout } from './pageLayout';

export * from './pageLayout';

/**
 * Every page saved in `variants/layouts/*.json` (see `layoutsBridge.ts`) as a variant `layout-<file name>`, in file
 * order. A file that is not a page is left out, so a broken one only drops its page.
 */
export const layoutVariants: PaintVariant[] = Object.entries(
  import.meta.glob<unknown>('../layouts/*.json', { eager: true, import: 'default' })
).flatMap(([path, value]) => {
  const layout = parsePageLayout(value);
  return layout ? [layoutVariant(fileId(path), layout)] : [];
});

function layoutVariant(id: string, layout: PageLayout): PaintVariant {
  return {
    id: `layout-${id}`,
    name: layout.name,
    description: `A page built in the component canvas: ${layout.parts.length} parts over the drawing.`,
    load: () => import('./LayoutStudio').then(({ layoutPage }) => layoutPage(layout))
  };
}

/** The page id from its file path, as the constructor named the file. */
function fileId(path: string) {
  return layoutId(path.split('/').at(-1)!.replace(/\.json$/, ''));
}
