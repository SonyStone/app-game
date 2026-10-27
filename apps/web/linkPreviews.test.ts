import { describe, expect, it } from 'vitest';
import { withLinkPreview } from './linkPreviews';

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="theme-color" content="#000000" />
    <title>Hub</title>
  </head>
  <body></body>
</html>`;

const preview = {
  path: '/tanki',
  site: 'Tanki',
  title: 'Tanki: King of the Hill',
  description: 'Red & blue "tanks"',
  image: 'apps/tanki/link-preview.jpg',
  color: '#c9473b'
};

describe('withLinkPreview', () => {
  it('puts the preview tags in the head in place of the title and theme color', () => {
    const html = withLinkPreview(page, preview, 'https://example.com/tanki/link-preview.jpg');

    expect(html).not.toContain('Hub');
    expect(html).not.toContain('#000000');
    expect(html).toContain('<title>Tanki: King of the Hill</title>');
    expect(html).toContain('<meta property="og:image" content="https://example.com/tanki/link-preview.jpg" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html.indexOf('og:title')).toBeLessThan(html.indexOf('</head>'));
  });

  it('escapes the text it puts into attributes', () => {
    const html = withLinkPreview(page, preview, 'https://example.com/a.jpg');

    expect(html).toContain('content="Red &amp; blue &quot;tanks&quot;"');
  });
});
