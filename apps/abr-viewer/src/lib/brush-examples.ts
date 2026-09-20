import dryMediaCover from '../assets/examples/covers/dry-media.jpg';
import gouacheCover from '../assets/examples/covers/gouache.jpg';
import halftonesCover from '../assets/examples/covers/halftones.jpg';
import mangaCover from '../assets/examples/covers/manga.jpg';
import megapackCover from '../assets/examples/covers/megapack.jpg';
import spatterCover from '../assets/examples/covers/spatter.jpg';
import springCover from '../assets/examples/covers/spring.jpg';
import watercolorCover from '../assets/examples/covers/watercolor.jpg';

/** Adobe brush downloads. Files are hosted by Adobe and are not bundled with the application. */
export const brushExamples = [
  {
    name: 'Spring 2024 Brushes',
    filename: 'Spring-Brushes-2024.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/Spring-Brushes-2024.abr',
    count: 30,
    size: '22 MB',
    cover: springCover,
    description: 'Foliage, colorful marks, fresh inks and textured drawing tools for spring.'
  },
  {
    name: 'Megapack',
    filename: 'megapack.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/megapack.abr',
    count: 465,
    size: '358 MB',
    cover: megapackCover,
    description: 'A broad collection of pencils, pastels, charcoal, ink, paint, blenders and erasers.'
  },
  {
    name: 'Dry Media',
    filename: 'dry_media.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/dry_media.abr',
    count: 35,
    size: '32 MB',
    cover: dryMediaCover,
    description: 'Expressive chalk, pencil and pastel marks with rough, tactile texture.'
  },
  {
    name: 'Gouache',
    filename: 'gouache.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/gouache.abr',
    count: 41,
    size: '29 MB',
    cover: gouacheCover,
    description: 'Painterly, opaque strokes with a mix of wet paint and dry-brush texture.'
  },
  {
    name: 'Halftones',
    filename: 'halftones_and_screentones.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/halftones_and_screentones.abr',
    count: 135,
    size: '75 MB',
    cover: halftonesCover,
    description: 'Pressure-controlled dots and screentones for shading, texture and graphic effects.'
  },
  {
    name: 'Manga Brushes',
    filename: 'manga.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/manga.abr',
    count: 41,
    size: '20 MB',
    cover: mangaCover,
    description: 'Fine inks, sketching tools and halftone textures for illustrated line work.'
  },
  {
    name: 'Spatter',
    filename: 'spatter_brushes.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/spatter_brushes.abr',
    count: 53,
    size: '28 MB',
    cover: spatterCover,
    description: 'Scattered droplets, sprays and splashes with pressure-sensitive density.'
  },
  {
    name: 'Watercolor',
    filename: 'watercolor.abr',
    url: 'https://download.adobe.com/pub/adobe/photoshop/brushes/watercolor.abr',
    count: 139,
    size: '83 MB',
    cover: watercolorCover,
    description: 'Layered washes, delicate details and textured watercolor effects.'
  }
] as const;

/** Catalog selection passed to the normal workspace importer. */
export type BrushExample = (typeof brushExamples)[number];
