import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class MultiDrawElementsInstancedWEBGL extends BaseCommand {
  static readonly commandName = 'multiDrawElementsInstancedWEBGL';

  protected get spiedCommandName(): string {
    return MultiDrawElementsInstancedWEBGL.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawArrays'));
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[3], 'drawArrays'));
    stringified.push(`drawCount=${args[8]}`);
    stringified.push(args[2]);
    stringified.push(args[5]);
    stringified.push(args[7]);

    return stringified;
  }
}
