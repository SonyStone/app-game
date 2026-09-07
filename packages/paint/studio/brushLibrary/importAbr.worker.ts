import { attempt } from '../asyncResult';
import { decodeAbrLibrary } from './decodeAbrLibrary';

/** One-shot decoder; the UI owns termination, including cancellation and malformed inputs. */
self.onmessage = async ({ data }: MessageEvent<File>) => {
  const result = await attempt(async () => decodeAbrLibrary(await data.arrayBuffer(), data.name));
  if (!result.ok) self.postMessage({ ok: false, error: result.error.message });
  else self.postMessage(result, { transfer: result.value.tips.map((tip) => tip.pixels.buffer as ArrayBuffer) });
};
