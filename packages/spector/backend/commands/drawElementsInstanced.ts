import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class DrawElementsInstanced extends BaseCommand {
  static readonly commandName = 'drawElementsInstanced';

  protected get spiedCommandName(): string {
    return DrawElementsInstanced.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawElementsInstanced'));
    stringified.push(args[1]);
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[2], 'drawElementsInstanced'));
    stringified.push(args[3]);
    stringified.push(args[4]);

    return stringified;
  }
}
