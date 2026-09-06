# ABR Parser Project Progress

## Project Goal
Create a TypeScript script that parses Photoshop `.abr` files and extracts:
- Full brush settings (dynamics, spacing, angle, etc.)
- Brush tip bitmap images (exported as PNG)
- Output as JSON + image files

## Requirements
- Focus on modern ABR format (v6+)
- Return clear errors for corrupted/unknown files
- Keep it simple for future web integration
- Can use npm packages

---

## Plan

### Phase 1: Research & Analysis ✅
- [x] Inspect sample .abr files to determine their versions
- [x] Research ABR file format documentation
- [x] Analyze binary structure of provided files
- [x] Document findings

### Phase 2: Schema Design ✅
- [x] Define TypeScript interfaces for ABR structure
- [x] Document file header format
- [x] Document brush descriptor format
- [x] Document image data format

### Phase 3: Implementation ✅
- [x] Set up TypeScript project with dependencies
- [x] Implement binary reader utilities
- [x] Implement ABR header parser
- [x] Implement brush descriptor parser
- [x] Implement image data extraction (RLE decompression)
- [x] Implement PNG export

### Phase 4: Testing ✅
- [x] Test with all provided .abr files
- [x] Validate extracted data
- [x] Handle edge cases

---

## Current Status

### ✅ COMPLETE: All Phases Done!

The ABR parser is fully functional for v6+, v9, and v10 formats.

---

## Test Results (All 9 Sample Files)

| File | Version | Brushes | Images | Status |
|------|---------|---------|--------|--------|
| 0 MH 8B Brushes.abr | 6.2 | 26 | 23 | ✅ |
| AI_Brush_collection.abr | 6.2 | 7 | 5 | ✅ |
| Basic_3.abr | 6.2 | 3 | 0 | ✅ (computed brushes) |
| CGCookie_BasicBrushes.abr | 10.2 | 9 | 5 | ✅ |
| Chunky_Chalk_Brush_by_MarkWinters.abr | 6.2 | 1 | 1 | ✅ |
| CtrlPaint - Digital Sketching.abr | 6.2 | 4 | 1 | ✅ |
| Driver_drow.abr | 9.2 | 11 | 2 | ✅ |
| MainBrushes.abr | 6.2 | 14 | 11 | ✅ |
| Paint_markers_brush_set_by_LDN755.abr | 6.2 | 20 | 20 | ✅ |

**Note:** Brushes without images are "computed" brushes (hard/soft round) which are generated mathematically rather than using sampled bitmaps.

---

## Completed Steps

### ✅ Phase 1: Research & Analysis
- Analyzed hex dumps of all 9 sample ABR files
- Identified ABR versions in sample files (v6, v9, v10)
- Found key structure markers: `8BIM`, `samp`, `patt`, `desc`
- Researched Adobe Photoshop File Format specification
- Understood Descriptor structure for brush settings

### ✅ Phase 2 & 3: Implementation
- Created TypeScript project structure with proper configuration
- Implemented `BinaryReader` class for big-endian binary parsing
- Implemented `DescriptorParser` for Photoshop descriptor format
- Implemented `AbrParser` for main parsing logic
- Implemented `ImageExporter` for PNG export using pngjs
- Created CLI tool for testing

### ✅ Key Discoveries & Fixes
1. **Descriptor Format**: Fixed Unicode class name handling - descriptors have a Unicode string prefix before the class ID
2. **Sample Block Format (v6.2)**: Found that sample data has a 301-byte header (38 bytes UUID + 263 bytes extra data) before the image bounds
3. **RLE Decompression**: Implemented PackBits algorithm for RLE-compressed brush images
4. **Computed vs Sampled Brushes**: Not all brushes have bitmap images - some are computed (hard/soft round)

---

## Findings & Notes

### ABR File Format Structure (v6+)

The modern ABR format consists of:

1. **Header** (4 bytes):
   - 2 bytes: Major version (BE uint16) - values: 6, 9, 10
   - 2 bytes: Minor version (BE uint16) - typically 2

2. **Resource Blocks** (repeated):
   - 4 bytes: Signature `8BIM`
   - 4 bytes: Key (`samp`, `patt`, `desc`)
   - 4 bytes: Length of data (BE uint32)
   - Variable: Data

3. **Sample Block (`samp`)**: Contains brush tip image data
   - Contains UUID identifiers for each brush
   - Raw grayscale image data (brush tip shapes)

4. **Pattern Block (`patt`)**: Contains pattern data (optional)

5. **Descriptor Block (`desc`)**: Contains brush settings
   - Uses Photoshop's Descriptor format
   - Contains all brush dynamics, spacing, angle, etc.

### Versions Found in Sample Files:
- v6: Basic_3.abr, MainBrushes.abr, most files
- v9: Driver_drow.abr
- v10: CGCookie_BasicBrushes.abr

### Sample Files Available:
1. `0 MH 8B Brushes.abr`
2. `AI_Brush_collection.abr`
3. `Basic_3.abr`
4. `CGCookie_BasicBrushes.abr`
5. `Chunky_Chalk_Brush_by_MarkWinters.abr`
6. `CtrlPaint - Digital Sketching.abr`
7. `Driver_drow.abr`
8. `MainBrushes.abr`
9. `Paint_markers_brush_set_by_LDN755.abr`

### Existing Reference:
- `abr_pattern.hexpat` - Hex pattern file with partial structure info

---

## Resources

_Will be added during research_

---

## Blockers

_None currently_
