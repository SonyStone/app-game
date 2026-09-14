import { abrBrushSettings, createAbrStroke, runAbrBrushCommand } from '@app-game/abr-paint';
import { abrBrushCommand } from '@app-game/abr-paint/commands';
import { defineBrushEngine } from './defineBrushEngine';

/** Registers the reusable ABR implementation with Paint's JSX/worker composition. */
export const abrBrush = defineBrushEngine({
  id: 'abr',
  parse: (input: unknown) => abrBrushSettings.parse(input),
  create: context => createAbrStroke(context),
  commands: { parse: (input: unknown) => abrBrushCommand.parse(input), run: context => runAbrBrushCommand(context) }
});
