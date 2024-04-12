import { ICommandCapture } from '../../../shared/capture/commandCapture';
import { WebGlConstants } from '../../types/webglConstants';
import { drawCommands } from '../../utils/drawCommands';
import { IParameter, ParameterState } from '../parameterState';

export class ScissorState extends ParameterState {
  static readonly stateName = 'ScissorState';

  get stateName(): string {
    return ScissorState.stateName;
  }

  protected getWebgl1Parameters(): IParameter[] {
    return [
      { constant: WebGlConstants.SCISSOR_TEST, changeCommands: ['enable', 'disable'] },
      { constant: WebGlConstants.SCISSOR_BOX, changeCommands: ['scissor'] }
    ];
  }

  protected isValidChangeCommand(command: ICommandCapture, stateName: string): boolean {
    if (command.name === 'enable' || command.name === 'disable') {
      return command.commandArguments[0] === WebGlConstants.SCISSOR_TEST.value;
    }
    return true;
  }

  protected getConsumeCommands(): string[] {
    return [...drawCommands, 'clear'];
  }

  protected isStateEnable(stateName: string, args: IArguments): boolean {
    return this.context.isEnabled(WebGlConstants.SCISSOR_TEST.value);
  }
}
