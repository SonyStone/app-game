import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class DrawElementsInstancedAngle extends BaseCommand {
  static readonly commandName = 'drawElementsInstancedANGLE';

  protected get spiedCommandName(): string {
    return DrawElementsInstancedAngle.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawElementsInstancedANGLE'));
    stringified.push(args[1]);
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[2], 'drawElementsInstancedANGLE'));
    stringified.push(args[3]);
    stringified.push(args[4]);

    return stringified;
  }
}
