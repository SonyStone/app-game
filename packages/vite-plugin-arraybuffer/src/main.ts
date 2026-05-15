import { PluginOption } from 'vite';

const arrayBufferSearchStr = '?ArrayBuffer';
const float32ArraySearchStr = '?Float32Array';
const uint8ArraySearchStr = '?Uint8Array';
const uint16ArraySearchStr = '?Uint16Array';
const uint32ArraySearchStr = '?Uint32Array';
const int32ArraySearchStr = '?Int32Array';
const supportedSearchStrings = [
  arrayBufferSearchStr,
  float32ArraySearchStr,
  uint8ArraySearchStr,
  uint16ArraySearchStr,
  uint32ArraySearchStr,
  int32ArraySearchStr
] as const;

export default function vitePluginArraybuffer(): PluginOption {
  return {
    name: 'vite-plugin-arraybuffer',
    enforce: 'pre',
    async resolveId(source, importer) {
      const suffix = getSupportedSuffix(source);
      if (!suffix) return null;

      const file = source.slice(0, -suffix.length);
      const resolved = await this.resolve(file, importer, { skipSelf: true });

      if (!resolved) return null;

      return `${resolved.id}${suffix}`;
    },
    load(id) {
      const suffix = getSupportedSuffix(id);
      if (!suffix) return null;

      const file = id.slice(0, -suffix.length);
      return createLoaderModule(file, suffix);
    }
  };
}

function getSupportedSuffix(id: string): (typeof supportedSearchStrings)[number] | undefined {
  return supportedSearchStrings.find((suffix) => id.endsWith(suffix));
}

function createLoaderModule(file: string, suffix: (typeof supportedSearchStrings)[number]): string {
  if (suffix === arrayBufferSearchStr) {
    return createArrayModule(file, 'response.arrayBuffer()');
  }

  if (suffix === float32ArraySearchStr) {
    return createArrayModule(file, 'response.arrayBuffer().then((buffer) => new Float32Array(buffer))');
  }

  if (suffix === uint8ArraySearchStr) {
    return createArrayModule(file, 'response.arrayBuffer().then((buffer) => new Uint8Array(buffer))');
  }

  if (suffix === uint16ArraySearchStr) {
    return createArrayModule(file, 'response.arrayBuffer().then((buffer) => new Uint16Array(buffer))');
  }

  if (suffix === uint32ArraySearchStr) {
    return createArrayModule(file, 'response.arrayBuffer().then((buffer) => new Uint32Array(buffer))');
  }

  return createArrayModule(file, 'response.arrayBuffer().then((buffer) => new Int32Array(buffer))');
}

function createArrayModule(file: string, responseExpression: string): string {
  return `
    import __arrayUrl from ${JSON.stringify(`${file}?url`)};

    export default function() {
      return fetch(__arrayUrl).then((response) => ${responseExpression});
    }
  `;
}
