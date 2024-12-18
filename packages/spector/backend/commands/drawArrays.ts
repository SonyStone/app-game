import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class DrawArrays extends BaseCommand {
  static readonly commandName = 'drawArrays';

  protected get spiedCommandName(): string {
    return DrawArrays.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawArrays'));
    stringified.push(args[1]);
    stringified.push(args[2]);

    return stringified;
  }
}
