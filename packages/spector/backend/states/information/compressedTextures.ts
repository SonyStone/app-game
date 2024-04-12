import { IContextInformation } from '../../types/contextInformation';
import { WebGlConstants } from '../../types/webglConstants';
import { IParameter, ParameterState } from '../parameterState';

export class CompressedTextures extends ParameterState {
  public get stateName(): string {
    return 'CompressedTextures';
  }

  constructor(options: IContextInformation) {
    super(options);

    this.currentState = this.startCapture(true, this.quickCapture, this.fullCapture);
  }

  protected getWebgl1Parameters(): IParameter[] {
    return [{ constant: WebGlConstants.COMPRESSED_TEXTURE_FORMATS }];
  }

  protected stringifyParameterValue(value: any, parameter: IParameter): any {
    const formats = [];
    for (const format of value) {
      formats.push(WebGlConstants.stringifyWebGlConstant(format as any, 'getParameter'));
    }
    return formats;
  }
}
