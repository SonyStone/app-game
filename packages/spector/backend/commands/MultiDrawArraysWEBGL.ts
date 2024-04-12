import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class MultiDrawArraysWEBGL extends BaseCommand {
  static readonly commandName = 'multiDrawArraysWEBGL';

  protected get spiedCommandName(): string {
    return MultiDrawArraysWEBGL.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'drawArrays'));
    stringified.push(`drawCount=${args[5]}`);
    stringified.push(args[2]);
    stringified.push(args[4]);

    return stringified;
  }
}
