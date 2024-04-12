import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class DrawBuffers extends BaseCommand {
  static readonly commandName = 'drawBuffers';

  protected get spiedCommandName(): string {
    return DrawBuffers.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    for (let i = 0; i < args.length; i++) {
      stringified.push(WebGlConstants.stringifyWebGlConstant(args[i], 'drawBuffers'));
    }

    return stringified;
  }
}
