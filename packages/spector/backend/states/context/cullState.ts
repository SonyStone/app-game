import { ICommandCapture } from '../../../shared/capture/commandCapture';
import { WebGlConstants } from '../../types/webglConstants';
import { drawCommands } from '../../utils/drawCommands';
import { IParameter, ParameterReturnType, ParameterState } from '../parameterState';

// tslint:disable:max-line-length
export class CullState extends ParameterState {
  static readonly stateName = 'CullState';

  get stateName(): string {
    return CullState.stateName;
  }

  protected getWebgl1Parameters(): IParameter[] {
    return [
      { constant: WebGlConstants.CULL_FACE, changeCommands: ['enable', 'disable'] },
      { constant: WebGlConstants.CULL_FACE_MODE, returnType: ParameterReturnType.GlEnum, changeCommands: ['cullFace'] }
    ];
  }

  protected getConsumeCommands(): string[] {
    return drawCommands;
  }

  protected isValidChangeCommand(command: ICommandCapture, stateName: string): boolean {
    if (command.name === 'enable' || command.name === 'disable') {
      return command.commandArguments[0] === WebGlConstants.CULL_FACE.value;
    }
    return true;
  }

  protected isStateEnable(stateName: string, args: IArguments): boolean {
    return this.context.isEnabled(WebGlConstants.CULL_FACE.value);
  }
}
