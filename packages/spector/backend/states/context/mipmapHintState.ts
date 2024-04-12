import { WebGlConstants } from '../../types/webglConstants';
import { IParameter, ParameterState } from '../parameterState';

export class MipmapHintState extends ParameterState {
  static readonly stateName = 'MipmapHintState';

  get stateName(): string {
    return MipmapHintState.stateName;
  }

  protected getWebgl1Parameters(): IParameter[] {
    return [{ constant: WebGlConstants.GENERATE_MIPMAP_HINT, changeCommands: ['hint'] }];
  }

  protected getConsumeCommands(): string[] {
    return ['generateMipmap'];
  }
}
