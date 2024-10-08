import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class DrawElements extends BaseCommand {
  static readonly commandName = 'drawElements';

  protected get spiedCommandName(): string {
    return DrawElements.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawElements'));
    stringified.push(args[1]);
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[2], 'drawElements'));
    stringified.push(args[3]);

    return stringified;
  }
}
