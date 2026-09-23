import { documentError, errorMessage } from '../../../../shared/errors';
import { buildCoverageTables } from './buildCoverageTables';

self.onmessage = (event: MessageEvent<Parameters<typeof buildCoverageTables>[0]>) => {
  try {
    const value = buildCoverageTables(event.data);
    self.postMessage({ ok: true, value }, { transfer: [value.offsets.buffer, value.areas.buffer, value.grids.buffer] });
  } catch (cause) {
    self.postMessage({ ok: false, error: documentError('decode', errorMessage(cause)) });
  }
};
