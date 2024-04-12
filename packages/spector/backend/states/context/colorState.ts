import { WebGlConstants } from '../../types/webglConstants';
import { drawCommands } from '../../utils/drawCommands';
import { IParameter, ParameterState } from '../parameterState';

export class ColorState extends ParameterState {
  static readonly stateName = 'ColorState';

  get stateName(): string {
    return ColorState.stateName;
  }

  protected getWebgl1Parameters(): IParameter[] {
    return [{ constant: WebGlConstants.COLOR_WRITEMASK, changeCommands: ['colorMask'] }];
  }

  protected getConsumeCommands(): string[] {
    return drawCommands;
  }
}
