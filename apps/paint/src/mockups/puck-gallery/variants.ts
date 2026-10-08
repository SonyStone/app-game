import type { VariantInfo } from './kit/variant';
import { command } from './variants/command';
import { deck } from './variants/deck';
import { dial } from './variants/dial';
import { glass } from './variants/glass';
import { hive } from './variants/hive';
import { hud } from './variants/hud';
import { orbit } from './variants/orbit';
import { pads } from './variants/pads';
import { pie } from './variants/pie';

/** The variants in the gallery's order; each lives in its own folder under `variants/` and loads on first use. */
export const variants: readonly VariantInfo[] = [pie, orbit, dial, pads, command, hive, deck, hud, glass];
