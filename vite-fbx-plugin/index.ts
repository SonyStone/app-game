import { readFileSync } from "fs";
import { PluginOption } from "vite";
import { BinaryReader, endOfContent } from "./fbx-loader/binary-reader";
import { parseNode } from "./fbx-loader/fbx-loader";
import { isFbxFormatBinary } from "./fbx-loader/is-fbx-format-binary";

const fileRegex = /\.(fbx)$/;

export default function viteFBXPlugin(): PluginOption {
  return {
    name: "fbx",

    transform(_: string, id: string) {
      if (fileRegex.test(id)) {
        const buffer = readFileSync(id);

        if (isFbxFormatBinary(buffer)) {
          const data: any = {};

          const reader = new BinaryReader(buffer);
          reader.skip(23); // skip magic 23 bytes

          console.log(`slice`, String.fromCharCode(...buffer.slice(0, 100)));

          data.FBXVersion = reader.getUint32();

          while (!endOfContent(reader)) {
            const node = parseNode(reader, data.FBXVersion);
            if (node !== null) data[node.name] = node;
          }

          return {
            code: `export default ${JSON.stringify(data)}`,
            map: null, // provide source map if available
          };
        }

        return {
          code: `export default "🤣"`,
          map: null, // provide source map if available
        };
      }
    },
  };
}
