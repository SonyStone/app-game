import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class DrawRangeElements extends BaseCommand {
  static readonly commandName = 'drawRangeElements';

  protected get spiedCommandName(): string {
    return DrawRangeElements.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawRangeElements'));

    stringified.push(args[1]);
    stringified.push(args[2]);
    stringified.push(args[3]);

    stringified.push(WebGlConstants.stringifyWebGlConstant(args[4], 'drawRangeElements'));

    stringified.push(args[5]);

    return stringified;
  }
}
