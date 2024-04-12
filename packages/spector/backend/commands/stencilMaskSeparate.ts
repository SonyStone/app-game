import { WebGlConstants } from '../types/webglConstants';
import { formatBinary } from '../utils/formatHelper';
import { BaseCommand } from './baseCommand';

export class StencilMaskSeparate extends BaseCommand {
  static readonly commandName = 'stencilMaskSeparate';

  protected get spiedCommandName(): string {
    return StencilMaskSeparate.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'stencilMaskSeparate'));
    stringified.push(formatBinary(args[1]));

    return stringified;
  }
}
