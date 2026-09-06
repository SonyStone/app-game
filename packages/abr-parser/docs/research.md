# Adobe Photoshop Brush File (.abr) Format Documentation

This document describes the binary format of Adobe Photoshop brush files (.abr) based on reverse engineering work done while building this parser. This covers ABR versions 6.1, 6.2, 9.x, and 10.x.

## Table of Contents

1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Version Header](#version-header)
4. [Resource Blocks (8BIM)](#resource-blocks-8bim)
5. [Sample Block (samp)](#sample-block-samp)
6. [Descriptor Block (desc)](#descriptor-block-desc)
7. [Pattern Block (patt)](#pattern-block-patt)
8. [Photoshop Descriptor Format](#photoshop-descriptor-format)
9. [Brush Properties](#brush-properties)
10. [Image Compression](#image-compression)
11. [UUID Matching](#uuid-matching)

---

## Overview

ABR files store Photoshop brush presets, including:
- **Computed brushes**: Algorithmically generated (round, elliptical) defined by parameters
- **Sampled brushes**: Bitmap-based brushes with grayscale tip images

The format uses big-endian byte order throughout.

### Supported Versions

| Version | Description |
|---------|-------------|
| 6.1 | Older format with simpler sample block header |
| 6.2 | Common modern format |
| 9.x | Extended format (treated as 6.2) |
| 10.x | Latest format (treated as 6.2) |

---

## File Structure

```
┌─────────────────────────────────────┐
│ Version Header (4 bytes)            │
├─────────────────────────────────────┤
│ Resource Block: Sample Data (samp)  │  ← Brush tip images
├─────────────────────────────────────┤
│ Resource Block: Descriptors (desc)  │  ← Brush settings
├─────────────────────────────────────┤
│ Resource Block: Patterns (patt)     │  ← Optional patterns
├─────────────────────────────────────┤
│ ... additional resource blocks ...  │
└─────────────────────────────────────┘
```

---

## Version Header

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 2 | uint16 | Major version (6, 9, or 10) |
| 2 | 2 | uint16 | Minor version (subversion: 1 or 2) |

The subversion affects the sample block header size:
- **Subversion 1**: 48-byte header (38 UUID + 10 padding)
- **Subversion 2**: 301-byte header (38 UUID + 263 padding)

---

## Resource Blocks (8BIM)

Each resource block follows the standard Photoshop resource format:

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 4 | char[4] | Signature: `8BIM` |
| 4 | 4 | char[4] | Key: `samp`, `desc`, `patt`, etc. |
| 8 | 4 | uint32 | Block data length |
| 12 | variable | bytes | Block data (padded to even length) |

### Known Resource Keys

| Key | Description |
|-----|-------------|
| `samp` | Sampled brush tip images |
| `desc` | Brush descriptors (settings) |
| `patt` | Pattern data for texture brushes |
| `phry` | Brush preset hierarchy |

---

## Sample Block (samp)

Contains bitmap data for sampled brush tips. Structure:

```
┌─────────────────────────────────────┐
│ Brush 1                             │
│ ├─ Length (4 bytes)                 │
│ ├─ UUID (38 bytes)                  │
│ ├─ Header padding (10 or 263 bytes) │
│ ├─ Bounds (16 bytes)                │
│ ├─ Depth (2 bytes)                  │
│ ├─ Compression (1 byte)             │
│ └─ Image data (variable)            │
├─────────────────────────────────────┤
│ Brush 2 ...                         │
└─────────────────────────────────────┘
```

### Sample Entry Format

| Field | Size | Type | Description |
|-------|------|------|-------------|
| Length | 4 | uint32 | Total brush entry length |
| UUID | 37 | char[37] | `$` + 36-char UUID (e.g., `$3479c62f-65c9-11de-bdeb-a55e96b1a876`) |
| Null | 1 | byte | Null terminator |
| Padding | 10/263 | bytes | Version-dependent header padding |
| Top | 4 | int32 | Bounding box top |
| Left | 4 | int32 | Bounding box left |
| Bottom | 4 | int32 | Bounding box bottom |
| Right | 4 | int32 | Bounding box right |
| Depth | 2 | uint16 | Bit depth: 8 or 16 |
| Compression | 1 | uint8 | 0 = raw, 1 = RLE |
| Data | variable | bytes | Image data |

### Image Dimensions

Calculated from bounds:
- `width = right - left`
- `height = bottom - top`

---

## Descriptor Block (desc)

Contains brush settings as Photoshop descriptors. Structure:

```
┌─────────────────────────────────────┐
│ Descriptor Count (4 bytes)          │
├─────────────────────────────────────┤
│ Descriptor 1                        │
│ ├─ Length (4 bytes)                 │
│ └─ Descriptor data                  │
├─────────────────────────────────────┤
│ Descriptor 2 ...                    │
└─────────────────────────────────────┘
```

Each descriptor represents one brush preset.

---

## Pattern Block (patt)

Optional block containing pattern data for texture brushes:

| Field | Size | Type | Description |
|-------|------|------|-------------|
| Version | 4 | uint32 | Pattern version |
| Mode | 4 | uint32 | Color mode |
| Height | 2 | uint16 | Pattern height |
| Width | 2 | uint16 | Pattern width |
| Name | variable | unicode | Pattern name |
| ID | variable | string | Pattern UUID |
| Data | variable | bytes | Pattern pixel data |

---

## Photoshop Descriptor Format

Descriptors are key-value structures used throughout Photoshop file formats.

### Descriptor Header

| Field | Size | Type | Description |
|-------|------|------|-------------|
| Name Length | 4 | uint32 | Unicode name length (often 0) |
| Name | variable | unicode | Class name (if length > 0) |
| Class ID Length | 4 | uint32 | 0 = 4-char ID, else string length |
| Class ID | 4 or variable | string | Class identifier |
| Item Count | 4 | uint32 | Number of key-value pairs |

### Value Types

| Type Code | Name | Structure |
|-----------|------|-----------|
| `long` | Integer | 4-byte signed int |
| `doub` | Double | 8-byte IEEE 754 double |
| `bool` | Boolean | 1 byte (0 = false) |
| `TEXT` | Text | Unicode string with length prefix |
| `enum` | Enumeration | Type ID + value ID |
| `UntF` | Unit Float | 4-char unit + 8-byte double |
| `Objc` | Object | Nested descriptor |
| `VlLs` | List | Array of values |
| `tdta` | Raw Data | Length + raw bytes |
| `obj ` | Reference | Object reference |

### String ID Format

Keys and enum values use a compact ID format:
- If length = 0: Read 4 ASCII characters
- If length > 0: Read `length` ASCII characters

### Unicode String Format

```
┌─────────────────────────────────────┐
│ Length (4 bytes, uint32)            │  ← Number of UTF-16 code units
├─────────────────────────────────────┤
│ UTF-16BE characters                 │  ← 2 bytes per character
├─────────────────────────────────────┤
│ Null terminator (2 bytes)           │  ← Included in length
└─────────────────────────────────────┘
```

### Unit Float Types

| Unit Code | Description |
|-----------|-------------|
| `#Pxl` | Pixels |
| `#Prc` | Percent |
| `#Ang` | Angle (degrees) |
| `#Rsl` | Resolution (DPI) |
| `#Rlt` | Relative |
| `#Nne` | None/unitless |

---

## Brush Properties

### Brush Descriptor Structure

Top-level descriptor class: `brushPreset` or `Brsh`

| Key | Type | Description |
|-----|------|-------------|
| `Nm  ` | TEXT | Brush name |
| `Brsh` | Objc | Brush settings object |

### Brush Settings Object

| Key | Type | Description |
|-----|------|-------------|
| `Dmtr` | UntF | Diameter (pixels) |
| `Hrdn` | UntF | Hardness (percent) |
| `Angl` | UntF | Angle (degrees) |
| `Rndn` | UntF | Roundness (percent) |
| `Spcn` | UntF | Spacing (percent) |
| `Intr` | bool | Interpolation |
| `flipX` | bool | Flip X |
| `flipY` | bool | Flip Y |
| `sampledData` | TEXT | UUID reference to sample block |
| `useTipDynamics` | bool | Enable brush dynamics |

### Brush Types

Determined by presence of `sampledData`:
- **Computed brush**: No `sampledData` field
- **Sampled brush**: Has `sampledData` with UUID

### Dynamics Settings

Shape dynamics are stored under `shapeDynamics` or `prVr` key:

| Key | Type | Description |
|-----|------|-------------|
| `szVr` | Objc | Size jitter |
| `angleDynamics` | Objc | Angle jitter |
| `roundnessDynamics` | Objc | Roundness jitter |
| `minimumDiameter` | UntF | Minimum size |
| `minimumRoundness` | UntF | Minimum roundness |

### Dynamic Control Object

| Key | Type | Description |
|-----|------|-------------|
| `bVTy` | long | Control type (see below) |
| `fStp` | long | Fade steps |
| `jitter` | UntF | Jitter amount (percent) |

### Control Type Values

| Value | Control |
|-------|---------|
| 0 | Off |
| 1 | Fade |
| 2 | Pen Pressure |
| 3 | Pen Tilt |
| 4 | Stylus Wheel |
| 7 | Rotation |

### Dual Brush Settings

Dual brush settings under `dualBrush` key with similar structure to main brush.

### Texture/Pattern Settings

| Key | Type | Description |
|-----|------|-------------|
| `Txtr` | Objc | Texture settings |
| `Ptrn` | Objc | Pattern reference |
| `Scl ` | UntF | Scale |
| `textureDepth` | UntF | Depth |
| `InvT` | bool | Invert texture |

---

## Image Compression

### Raw Format (compression = 0)

Grayscale pixels stored left-to-right, top-to-bottom:
- 8-bit: 1 byte per pixel (0-255)
- 16-bit: 2 bytes per pixel, big-endian (0-65535, scaled to 0-255)

### RLE Compression (compression = 1)

PackBits-style run-length encoding:

1. **Row byte counts**: First `height` × 2 bytes contain uint16 byte counts for each row
2. **Compressed rows**: Each row is independently compressed

#### RLE Decoding Algorithm

```
for each byte n:
  if n >= 128:
    # Run of identical bytes
    count = 257 - n
    read next byte, repeat it 'count' times
  else:
    # Literal bytes
    count = n + 1
    copy next 'count' bytes directly
```

---

## UUID Matching

Sampled brushes link descriptor settings to bitmap data via UUIDs.

### Sample UUID Format
- Stored with `$` prefix: `$3479c62f-65c9-11de-bdeb-a55e96b1a87`
- 37 characters total ($ + 36-char UUID, sometimes truncated)

### Descriptor UUID Format
- Stored without prefix in `sampledData` field
- Full 36-character UUID: `3479c62f-65c9-11de-bdeb-a55e96b1a876`

### Matching Strategy

1. Strip `$` prefix from sample UUID
2. Normalize to lowercase
3. Compare first 35 characters (handles truncation)
4. Fall back to index-based matching if UUID mismatch

---

## Binary Format Quick Reference

### Data Types

| Type | Size | Description |
|------|------|-------------|
| uint8 | 1 | Unsigned 8-bit integer |
| int8 | 1 | Signed 8-bit integer |
| uint16 | 2 | Unsigned 16-bit integer (big-endian) |
| int16 | 2 | Signed 16-bit integer (big-endian) |
| uint32 | 4 | Unsigned 32-bit integer (big-endian) |
| int32 | 4 | Signed 32-bit integer (big-endian) |
| double | 8 | IEEE 754 double precision (big-endian) |
| char[n] | n | ASCII string (not null-terminated unless specified) |
| unicode | variable | UTF-16BE with length prefix |

### Alignment

- Resource blocks: Padded to even byte boundary
- Sample entries: Padded to 4-byte boundary

---

## Example: Parsing a Simple ABR File

```typescript
import { AbrParser } from 'abr-parser';

const parser = new AbrParser();
const file = parser.parse(arrayBuffer);

console.log(`Version: ${file.version}.${file.subVersion}`);
console.log(`Brushes: ${file.brushes.length}`);

for (const brush of file.brushes) {
  console.log(`- ${brush.name} (${brush.type})`);
  if (brush.brushTip) {
    console.log(`  Size: ${brush.brushTip.width}x${brush.brushTip.height}`);
  }
}
```

---

## References

- [Photoshop File Formats Specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/)
- [GIMP ABR plugin source](https://gitlab.gnome.org/GNOME/gimp/-/tree/master/plug-ins/file-psd)
- [psd.js descriptor parser](https://github.com/meltingice/psd.js)

---

*This documentation was created as part of the abr-parser project.*
*Last updated: February 2026*
