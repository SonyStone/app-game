import { WebGlConstants } from '../types/webglConstants';
import { formatBinary } from '../utils/formatHelper';
import { BaseCommand } from './baseCommand';

export class StencilFuncSeparate extends BaseCommand {
  static readonly commandName = 'stencilFuncSeparate';

  protected get spiedCommandName(): string {
    return StencilFuncSeparate.commandName;
  }

  protected stringifyArgs(args: IArguments): string[] {
    const stringified = [];
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[0], 'stencilFuncSeparate'));
    stringified.push(WebGlConstants.stringifyWebGlConstant(args[1], 'stencilFuncSeparate'));
    stringified.push(formatBinary(args[2]));
    stringified.push(formatBinary(args[3]));

    return stringified;
  }
}
