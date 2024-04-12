import { WebGlConstants } from '../types/webglConstants';
import { BaseCommand } from './baseCommand';

export class MultiDrawArraysInstancedBaseInstanceWEBGL extends BaseCommand {
  static readonly commandName = 'multiDrawArraysInstancedBaseInstanceWEBGL';

  protected get spiedCommandName(): string {
    return MultiDrawArraysInstancedBaseInstanceWEBGL.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'multiDrawArraysInstancedBaseInstanceWEBGL'));
    stringified.push(`drawCount=${args[9]}`);
    stringified.push(args[2]);
    stringified.push(args[4]);
    stringified.push(args[6]);
    stringified.push(args[8]);

    return stringified;
  }
}
