import { photoshopDefaultSettings, type PsdRenderSettings } from '@app-game/psd/viewer';
import adjustmentStack from './assets/adjustment-stack.psd?url';
import cmykLevels from './assets/cmyk-levels.psd?url';
import passThroughGroups from './assets/pass-through-groups.psd?url';
import rotatedSmartObject from './assets/rotated-smart-object.psd?url';
import typeWithLayerStyles from './assets/type-with-layer-styles.psd?url';

/** Our own captures were saved with "Blend RGB Colors Using Gamma 1.0" on. */
const gammaOne: PsdRenderSettings = { ...photoshopDefaultSettings, linearBlending: true };

/**
 * Small documents bundled with the viewer, each with the Color Settings it was saved under; attribution is in
 * assets/NOTICE.
 */
export const psdExamples = [
  {
    name: 'Adjustment stack',
    file: 'adjustment-stack.psd',
    url: adjustmentStack,
    size: '38 KB',
    settings: photoshopDefaultSettings,
    description: 'Levels, Curves, Hue/Saturation and Posterize adjustment layers over a Background. Renders exactly.',
    credit: 'PhotoCraft Corpus (MIT)'
  },
  {
    name: 'Type with layer styles',
    file: 'type-with-layer-styles.psd',
    url: typeWithLayerStyles,
    size: '82 KB',
    settings: photoshopDefaultSettings,
    description: 'A Sharp type layer with Stroke and Bevel & Emboss. Turn text gamma off to see it change.',
    credit: 'PhotoCraft Corpus (MIT)'
  },
  {
    name: 'Nested Pass Through groups',
    file: 'pass-through-groups.psd',
    url: passThroughGroups,
    size: '23 KB',
    settings: gammaOne,
    description:
      'Two Pass Through groups holding a Multiply layer and an Exposure adjustment; captured with gamma 1.0 blending.',
    credit: 'photoshop-analysis capture'
  },
  {
    name: 'Rotated smart object',
    file: 'rotated-smart-object.psd',
    url: rotatedSmartObject,
    size: '25 KB',
    settings: gammaOne,
    description:
      'An embedded PNG placed at 17°. Exact from its cached raster, and re-rendered with Bicubic or Bicubic Automatic interpolation; the other interpolations resample differently.',
    credit: 'photoshop-analysis capture'
  },
  {
    name: 'CMYK with Levels',
    file: 'cmyk-levels.psd',
    url: cmykLevels,
    size: '51 KB',
    settings: photoshopDefaultSettings,
    description:
      'A Levels adjustment in CMYK: composited exactly in its CMYK channels, compared channel by channel; only the view converts to sRGB approximately.',
    credit: 'PhotoCraft Corpus (MIT)'
  }
] as const satisfies readonly PsdExample[];

/** One bundled example document. */
export type PsdExample = {
  name: string;
  file: string;
  url: string;
  size: string;
  settings: PsdRenderSettings;
  description: string;
  credit: string;
};
