import { ICommandCapture } from '../../../shared/capture/commandCapture';
import { WebGlConstants } from '../../types/webglConstants';
import { drawCommands } from '../../utils/drawCommands';
import { IParameter, ParameterReturnType, ParameterState } from '../parameterState';
// tslint:disable:max-line-length

export class BlendState extends ParameterState {
  static readonly stateName = 'BlendState';

  get stateName(): string {
    return BlendState.stateName;
  }

  protected getWebgl1Parameters(): IParameter[] {
    return [
      { constant: WebGlConstants.BLEND, changeCommands: ['enable', 'disable'] },
      { constant: WebGlConstants.BLEND_COLOR, changeCommands: ['blendColor'] },
      {
        constant: WebGlConstants.BLEND_DST_ALPHA,
        returnType: ParameterReturnType.GlEnum,
        changeCommands: ['blendFunc', 'blendFuncSeparate']
      },
      {
        constant: WebGlConstants.BLEND_DST_RGB,
        returnType: ParameterReturnType.GlEnum,
        changeCommands: ['blendFunc', 'blendFuncSeparate']
      },
      // { constant: WebGlConstants.BLEND_EQUATION, returnType: ParameterReturnType.GlEnum, changeCommands: ["blendEquation", "blendEquationSeparate"] },
      {
        constant: WebGlConstants.BLEND_EQUATION_ALPHA,
        returnType: ParameterReturnType.GlEnum,
        changeCommands: ['blendEquation', 'blendEquationSeparate']
      },
      {
        constant: WebGlConstants.BLEND_EQUATION_RGB,
        returnType: ParameterReturnType.GlEnum,
        changeCommands: ['blendEquation', 'blendEquationSeparate']
      },
      {
        constant: WebGlConstants.BLEND_SRC_ALPHA,
        returnType: ParameterReturnType.GlEnum,
        changeCommands: ['blendFunc', 'blendFuncSeparate']
      },
      {
        constant: WebGlConstants.BLEND_SRC_RGB,
        returnType: ParameterReturnType.GlEnum,
        changeCommands: ['blendFunc', 'blendFuncSeparate']
      }
    ];
  }

  protected isValidChangeCommand(command: ICommandCapture, stateName: string): boolean {
    if (command.name === 'enable' || command.name === 'disable') {
      return command.commandArguments[0] === WebGlConstants.BLEND.value;
    }
    return true;
  }

  protected getConsumeCommands(): string[] {
    return drawCommands;
  }

  protected isStateEnable(stateName: string, args: IArguments): boolean {
    return this.context.isEnabled(WebGlConstants.BLEND.value);
  }
}
