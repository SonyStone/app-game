import { brushCategories, numberSettings as numbersOf, type BrushCategory, type BrushSetting } from './schema';

/**
 * The name a number setting has as a part alone on the board, unique across the registry. A name from
 * {@link boardNames} comes first; otherwise Paint's own settings keep their labels, and a Photoshop setting takes the
 * shortest of its label, its section and label ("Size jitter"), and its category, section and label that no other
 * setting has.
 */
export function brushSettingName(category: BrushCategory, setting: BrushSetting): string {
  const named = boardNames[setting.id];
  if (named) {
    return named;
  }

  if (!setting.id.startsWith('abr-')) {
    return setting.label;
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
  spacing: 'Tip spacing',
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

/**
 * Every number setting of the registry, with the Photoshop rows it once had beside Paint's (`replacedSettings`), so
 * that the names of the rows that stayed do not change.
 */
const numberSettings = [
  ...numbersOf(brushCategories.flatMap((c) => c.settings)),
  ...['Size', 'Hardness', 'Opacity', 'Flow'].map((label) => ({ label, section: undefined }))
];

/** A label inside a section as one phrase: "Size" and "Jitter" make "Size jitter". */
function phrase(section: string | undefined, label: string) {
  return section ? `${section} ${label.toLowerCase()}` : label;
}
