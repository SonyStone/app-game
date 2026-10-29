import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Plugin } from 'vite';

/** What a chat or social site shows when someone pastes a link to one of the hub's sections. */
export type LinkPreview = {
  /** The section's address, as `/tanki`: its pages, as `/tanki/koth`, share the preview. */
  path: string;
  /** Name of the site above the title, as itch.io shows its own. */
  site: string;
  title: string;
  description: string;
  /** Path of a 1200×630 picture on disk; the build copies it next to the section's page. */
  image: string;
  /** Color of the embed's edge in Discord. */
  color: string;
};

/**
 * Writes, after a build, a copy of the hub's `index.html` for each preview to `<path>/index.html`, with Open
 * Graph and Twitter card tags that describe the section, and copies the preview's picture beside it. Link
 * crawlers run no scripts, so the single-page app shows them these tags only if the server answers a section's
 * pages with its own copy: `vercel.json` rewrites `<path>/:path*` to it. Picture addresses are absolute, as the
 * crawlers require, on the production domain Vercel names in `VERCEL_PROJECT_PRODUCTION_URL`, or `origin`
 * outside Vercel.
 */
export function linkPreviews(previews: readonly LinkPreview[], origin: string): Plugin {
  return {
    name: 'link-previews',
    apply: 'build',
    async writeBundle(options) {
      const outDir = options.dir!;
      const html = await readFile(join(outDir, 'index.html'), 'utf8');
      const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
      const site = host ? `https://${host}` : origin;

      for (const preview of previews) {
        const dir = join(outDir, preview.path);
        const image = `${preview.path}/${basename(preview.image)}`;
        await mkdir(dir, { recursive: true });
        await writeFile(join(outDir, image), await readFile(preview.image));
        await writeFile(join(dir, 'index.html'), withLinkPreview(html, preview, `${site}${image}`));
      }
    }
  };
}

/**
 * Returns `html` with the tags that describe `preview` in its head, its picture at the absolute address
 * `image`; they replace the page's `<title>` and `theme-color`.
 */
export function withLinkPreview(html: string, preview: LinkPreview, image: string) {
  const tags = [
    `<title>${escape(preview.title)}</title>`,
    `<meta name="description" content="${escape(preview.description)}" />`,
    `<meta name="theme-color" content="${escape(preview.color)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(preview.site)}" />`,
    `<meta property="og:title" content="${escape(preview.title)}" />`,
    `<meta property="og:description" content="${escape(preview.description)}" />`,
    `<meta property="og:image" content="${escape(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`
  ];

  return html
    .replace(/\s*<title>[^<]*<\/title>/, '')
    .replace(/\s*<meta name="theme-color"[^>]*>/, '')
    .replace('</head>', `  ${tags.join('\n    ')}\n  </head>`);
}

function escape(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
