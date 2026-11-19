import { abrCategories } from './abrSchema';
import { brushCategories, numberSettings as numbersOf, type BrushCategory, type BrushSetting } from './schema';

/**
 * The name a number setting has as a part alone on the board, unique across Paint's and ABR's settings (a setting both
 * schemas share counts once). A name from {@link boardNames} comes first; otherwise a Paint setting keeps its label, and
 * an ABR setting takes the shortest of its label, its section and label ("Size jitter"), and its category, section
 * and label that no other setting has.
 */
export function brushSettingName(category: BrushCategory, setting: BrushSetting): string {
  const named = boardNames[setting.id];
  if (named) {
    return named;
  }

  const own = numbersOf(brushCategories.flatMap((c) => c.settings)).find((s) => s.id === setting.id);
  if (own) {
    return own.label;
  }

  if (numberSettings.filter((s) => s.label === setting.label).length === 1) {
    return setting.label;
  }

  const name = phrase(setting.section, setting.label);
  if (numberSettings.filter((s) => phrase(s.section, s.label) === name).length === 1) {
    return name;
  }

  return phrase(category.label, name);
}

/**
 * Names given by hand, by setting ID, where the generated one means little on its own on the board ("Minimum", "X")
 * or reads awkwardly ("Scattering scatter amount").
 */
const boardNames: Record<string, string> = {
  'abr-scattering-scatter': 'Scatter',
  'abr-scattering-count': 'Scatter count',
  'abr-scattering-countJitter': 'Scatter count jitter',
  'abr-scattering-countFade': 'Scatter count fade length',
  'abr-texture-scale': 'Texture scale',
  'abr-texture-brightness': 'Texture brightness',
  'abr-texture-contrast': 'Texture contrast',
  'abr-texture-depth': 'Texture depth',
  'abr-texture-depthJitter': 'Texture depth jitter',
  'abr-texture-minimumDepth': 'Texture depth minimum',
  'abr-texture-depthFade': 'Texture depth fade length',
  'abr-dualBrush-scatter': 'Second tip scatter',
  'abr-dualBrush-count': 'Second tip count',
  'abr-colorDynamics-foregroundBackgroundJitter': 'FG/BG jitter',
  'abr-colorDynamics-fade': 'FG/BG fade length',
  'abr-brushPose-tiltX': 'Tilt X',
  'abr-brushPose-tiltY': 'Tilt Y',
  'abr-brushPose-rotation': 'Pose rotation',
  'abr-brushPose-pressure': 'Pose pressure',
  'abr-smoothing-amount': 'Photoshop smoothing',
  'abr-bristle-density': 'Bristle density',
  'abr-bristle-thickness': 'Bristle thickness',
  'abr-bristle-stiffness': 'Bristle stiffness',
  'abr-bristle-clumping': 'Bristle clumping',
  'abr-erodible-softness': 'Tip softness'
};

/** Every number setting of both schemas, a setting they share once. */
const numberSettings = [
  ...new Map(
    [...brushCategories, ...abrCategories].flatMap((c) => numbersOf(c.settings).map((s) => [s.id, s] as const))
  ).values()
];

/** A label inside a section as one phrase: "Size" and "Jitter" make "Size jitter". */
function phrase(section: string | undefined, label: string) {
  return section ? `${section} ${label.toLowerCase()}` : label;
}
