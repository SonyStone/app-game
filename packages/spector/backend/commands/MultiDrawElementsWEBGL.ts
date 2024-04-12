import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class MultiDrawElementsWEBGL extends BaseCommand {
  static readonly commandName = 'multiDrawElementsWEBGL';

  protected get spiedCommandName(): string {
    return MultiDrawElementsWEBGL.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawArrays'));
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[3], 'drawArrays'));
    stringified.push(`drawCount=${args[6]}`);
    stringified.push(args[2]);
    stringified.push(args[5]);

    return stringified;
  }
}
