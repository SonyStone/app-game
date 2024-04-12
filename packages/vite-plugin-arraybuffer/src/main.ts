import { PluginOption } from 'vite';

const arrayBufferSearchStr = '?ArrayBuffer';
const float32ArraySearchStr = '?Float32Array';
const uint8ArraySearchStr = '?Uint8Array';
const uint16ArraySearchStr = '?Uint16Array';
const uint32ArraySearchStr = '?Uint32Array';
const int32ArraySearchStr = '?Int32Array';

export default function vitePluginArraybuffer(): PluginOption {
  return {
    name: 'vite-plugin-arraybuffer',
    transform(_src, id) {
      if (id.endsWith(arrayBufferSearchStr)) {
        const file = id.slice(0, -arrayBufferSearchStr.length);
        return `
          import __arrayUrl from '${file}?url';

          export default function() {
            return fetch(__arrayUrl)
              .then((response) => response.arrayBuffer());
          }
        `;
      }
      if (id.endsWith(float32ArraySearchStr)) {
        const file = id.slice(0, -float32ArraySearchStr.length);
        const code = `
          import __arrayUrl from '${file}?url';

          export default function() {
            return fetch(__arrayUrl)
              .then((response) => response.arrayBuffer())
              .then((buffer) => new Float32Array(buffer));
          }
        `;

        return code;
      }
      if (id.endsWith(uint8ArraySearchStr)) {
        const file = id.slice(0, -uint8ArraySearchStr.length);
        const code = `
          import __arrayUrl from '${file}?url';

          export default function() {
            return fetch(__arrayUrl)
              .then((response) => response.arrayBuffer())
              .then((buffer) => new Uint8Array(buffer));
          }
        `;

        return code;
      }
      if (id.endsWith(uint16ArraySearchStr)) {
        const file = id.slice(0, -uint16ArraySearchStr.length);
        const code = `
          import __arrayUrl from '${file}?url';

          export default function() {
            return fetch(__arrayUrl)
              .then((response) => response.arrayBuffer())
              .then((buffer) => new Uint16Array(buffer));
          }
        `;

        return code;
      }
      if (id.endsWith(uint32ArraySearchStr)) {
        const file = id.slice(0, -uint32ArraySearchStr.length);
        const code = `
          import __arrayUrl from '${file}?url';

          export default function() {
            return fetch(__arrayUrl)
              .then((response) => response.arrayBuffer())
              .then((buffer) => new Uint32Array(buffer));
          }
        `;

        return code;
      }
      if (id.endsWith(int32ArraySearchStr)) {
        const file = id.slice(0, -int32ArraySearchStr.length);
        const code = `
          import __arrayUrl from '${file}?url';

          export default function() {
            return fetch(__arrayUrl)
              .then((response) => response.arrayBuffer())
              .then((buffer) => new Int32Array(buffer));
          }
        `;

        return code;
      }

      return;
    }
  };
}
