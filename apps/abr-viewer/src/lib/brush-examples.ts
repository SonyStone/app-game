import dryMedia from '../assets/examples/dry_media.abr?url';
import gouache from '../assets/examples/gouache.abr?url';
import halftones from '../assets/examples/halftones_and_screentones.abr?url';
import manga from '../assets/examples/manga.abr?url';
import megapack from '../assets/examples/megapack.abr?url';
import spatter from '../assets/examples/spatter_brushes.abr?url';
import spring from '../assets/examples/Spring-Brushes-2024.abr?url';
import watercolor from '../assets/examples/watercolor.abr?url';

import dryMediaCover from '../assets/examples/covers/dry-media.jpg';
import gouacheCover from '../assets/examples/covers/gouache.jpg';
import halftonesCover from '../assets/examples/covers/halftones.jpg';
import mangaCover from '../assets/examples/covers/manga.jpg';
import megapackCover from '../assets/examples/covers/megapack.jpg';
import spatterCover from '../assets/examples/covers/spatter.jpg';
import springCover from '../assets/examples/covers/spring.jpg';
import watercolorCover from '../assets/examples/covers/watercolor.jpg';

/** Original example libraries, fetched individually when selected rather than on application startup. */
export const brushExamples = [
  {
    name: 'Spring 2024 Brushes',
    filename: 'Spring-Brushes-2024.abr',
    url: spring,
    count: 30,
    size: '22 MB',
    cover: springCover,
    description: 'Foliage, colorful marks, fresh inks and textured drawing tools for spring.'
  },
  {
    name: 'Megapack',
    filename: 'megapack.abr',
    url: megapack,
    count: 465,
    size: '358 MB',
    cover: megapackCover,
    description: 'A broad collection of pencils, pastels, charcoal, ink, paint, blenders and erasers.'
  },
  {
    name: 'Dry Media',
    filename: 'dry_media.abr',
    url: dryMedia,
    count: 35,
    size: '32 MB',
    cover: dryMediaCover,
    description: 'Expressive chalk, pencil and pastel marks with rough, tactile texture.'
  },
  {
    name: 'Gouache',
    filename: 'gouache.abr',
    url: gouache,
    count: 41,
    size: '29 MB',
    cover: gouacheCover,
    description: 'Painterly, opaque strokes with a mix of wet paint and dry-brush texture.'
  },
  {
    name: 'Halftones',
    filename: 'halftones_and_screentones.abr',
    url: halftones,
    count: 135,
    size: '75 MB',
    cover: halftonesCover,
    description: 'Pressure-controlled dots and screentones for shading, texture and graphic effects.'
  },
  {
    name: 'Manga Brushes',
    filename: 'manga.abr',
    url: manga,
    count: 41,
    size: '20 MB',
    cover: mangaCover,
    description: 'Fine inks, sketching tools and halftone textures for illustrated line work.'
  },
  {
    name: 'Spatter',
    filename: 'spatter_brushes.abr',
    url: spatter,
    count: 53,
    size: '28 MB',
    cover: spatterCover,
    description: 'Scattered droplets, sprays and splashes with pressure-sensitive density.'
  },
  {
    name: 'Watercolor',
    filename: 'watercolor.abr',
    url: watercolor,
    count: 139,
    size: '83 MB',
    cover: watercolorCover,
    description: 'Layered washes, delicate details and textured watercolor effects.'
  }
] as const;

/** Catalog selection passed to the normal workspace importer. */
export type BrushExample = (typeof brushExamples)[number];

/** Fetches a bundled ABR, preserving its original filename for the workspace group and export. */
export async function fetchBrushExample(example: BrushExample): Promise<File> {
  const response = await fetch(example.url);
  if (!response.ok) throw new Error(`Could not load ${example.name} (${response.status})`);
  const blob = await response.blob();
  const header = await blob.slice(0, 256).text();
  if (header.startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error(
      `${example.name} is unavailable: this deployment contains a Git LFS pointer instead of the brush file. Enable Git LFS in Vercel and redeploy. You can still import a local .abr file.`
    );
  }
  if (/^\s*(?:<!doctype html|<html)/i.test(header)) {
    throw new Error(`${example.name} is unavailable: the server returned a web page instead of the brush file.`);
  }
  return new File([blob], example.filename, { type: 'application/octet-stream' });
}
