# texcoord.buf

| color                   | uv texcoord                                    |
| ----------------------- | ---------------------------------------------- |
| Uint8Array(R8 G8 B8 A8) | Float32Array(U32 V32) or Float16Array(U16 V16) |

# texture.dds

unsing WEBGL compressed texture stuff and dds DirectX texture format
`WEBGL_compressed_texture_s3tc` or `EXT_texture_compression_bptc`
see `dds.ts`

# position.buf

| position                  | normal                    | tangent                       |
| ------------------------- | ------------------------- | ----------------------------- |
| Float32Array(X32 Y32 Z32) | Float32Array(X32 Y32 Z32) | Float32Array(X32 Y32 Z32 W32) |

# \*.ib

| index       |
| ----------- |
| Uint32Array |
