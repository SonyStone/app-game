import { createContextProvider } from '@utils/createContextProvider';
import { TgpuRenderPipeline } from 'typegpu';
import { Vec4f } from 'typegpu/data';

export const [AppStateProvider, useAppState] = createContextProvider<
  Partial<{
    redPipeline: TgpuRenderPipeline<Vec4f>;
    bluePipeline: TgpuRenderPipeline<Vec4f>;
  }>
>(() => ({}));
