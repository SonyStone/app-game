//! Prepared quadratic-glyph profile. Disk quads expand to the current 12-byte GPU vertices.

use crate::{
    container::{self, Section, u16_at, u32_at},
    error::DocumentError,
};

/// Decodes and validates a complete profile before exposing any renderable data.
///
/// # Errors
/// In addition to container errors, rejects missing/unknown required sections,
/// invalid page ranges, atlas references, and more than four million glyphs.
pub fn decode(bytes: &[u8]) -> Result<Document, DocumentError> {
    let mut sections = container::decode(bytes)?;
    if sections
        .iter()
        .any(|s| s.required && !matches!(&s.tag, b"PAGE" | b"GLYP" | b"ATLS" | b"PRER"))
    {
        return Err(DocumentError::Unsupported("required section"));
    }
    let glyphs = take(&mut sections, *b"GLYP")?;
    if glyphs.len() % 20 != 0 {
        return Err(DocumentError::Invalid("glyph record length"));
    }
    let count = glyphs.len() / 20;
    if count > 4_000_000 {
        return Err(DocumentError::Limit("glyph count"));
    }
    let pages = read_pages(&take(&mut sections, *b"PAGE")?, count)?;
    let atlas = read_sized_buffer(take(&mut sections, *b"ATLS")?)?;
    if atlas.data.len() != atlas.width as usize * atlas.height as usize * 4 {
        return Err(DocumentError::Invalid("curve atlas length"));
    }
    let prerender = read_sized_buffer(take(&mut sections, *b"PRER")?)?;
    if prerender.data.len() % 72 != 0 {
        return Err(DocumentError::Invalid("atlas vertex length"));
    }
    for vertex in prerender.data.chunks_exact(12) {
        check_curve_origin(u16_at(vertex, 4) / 2, u16_at(vertex, 6) / 2, &atlas)?;
    }
    // Validate the complete input before allocating the much larger GPU stream.
    for glyph in glyphs.chunks_exact(20) {
        check_curve_origin(u16_at(glyph, 4), u16_at(glyph, 6), &atlas)?;
    }
    let (vertices, positions_x, positions_y) = expand_glyphs(&glyphs);
    Ok(Document {
        pages,
        vertices,
        positions_x,
        positions_y,
        atlas,
        prerender,
    })
}

/// CPU-owned render data; no file offsets or compressed buffers reach the GPU.
#[derive(Debug)]
pub struct Document {
    /// Pages in source order; their view layout is chosen by the application.
    pub pages: Vec<Page>,
    /// Six 12-byte vertices per glyph, ready for upload.
    pub vertices: Vec<u8>,
    /// Glyph-center x coordinates used by the demo camera tour.
    pub positions_x: Vec<f32>,
    /// Glyph-center y coordinates used by the demo camera tour.
    pub positions_y: Vec<f32>,
    /// Exact RGBA8 curve metadata, sampled with integer texel reads.
    pub atlas: SizedBuffer,
    /// Glyph quads for building the small-text coverage texture.
    pub prerender: SizedBuffer,
}

/// Page geometry uses source units; glyph positions use the profile's normalized units.
#[derive(Debug, PartialEq)]
pub struct Page {
    /// Positive finite width in source units.
    pub width: f64,
    /// Positive finite height in source units.
    pub height: f64,
    /// First glyph, not a GPU vertex offset.
    pub first_glyph: u32,
    /// Number of glyphs belonging to this page.
    pub glyph_count: u32,
}

/// Dimensions followed by profile-specific bytes (texels or prerender vertices).
#[derive(Debug)]
pub struct SizedBuffer {
    /// Texture width, at most 16,384.
    pub width: u32,
    /// Texture height, at most 16,384.
    pub height: u32,
    /// RGBA8 texels for ATLS; 12-byte vertices for PRER.
    pub data: Vec<u8>,
}

fn take(sections: &mut Vec<Section>, tag: [u8; 4]) -> Result<Vec<u8>, DocumentError> {
    let index = sections
        .iter()
        .position(|s| s.tag == tag)
        .ok_or(DocumentError::Invalid("missing profile section"))?;
    Ok(sections.swap_remove(index).data)
}

fn read_pages(bytes: &[u8], glyph_count: usize) -> Result<Vec<Page>, DocumentError> {
    if bytes.is_empty() || !bytes.len().is_multiple_of(24) || bytes.len() / 24 > 100_000 {
        return Err(DocumentError::Invalid("page table length"));
    }
    let mut next = 0u32;
    let pages = bytes
        .chunks_exact(24)
        .map(|record| {
            let width =
                f64::from_bits(u64::from(u32_at(record, 0)) | (u64::from(u32_at(record, 4)) << 32));
            let height = f64::from_bits(
                u64::from(u32_at(record, 8)) | (u64::from(u32_at(record, 12)) << 32),
            );
            let first_glyph = u32_at(record, 16);
            let count = u32_at(record, 20);
            if !(0.001..=1_000_000.0).contains(&width)
                || !(0.001..=1_000_000.0).contains(&height)
                || first_glyph != next
                || first_glyph as usize > glyph_count
                || count as usize > glyph_count - first_glyph as usize
            {
                return Err(DocumentError::Invalid("page geometry or glyph range"));
            }
            next += count;
            Ok(Page {
                width,
                height,
                first_glyph,
                glyph_count: count,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if next as usize != glyph_count {
        return Err(DocumentError::Invalid("unassigned glyphs"));
    }
    Ok(pages)
}

fn read_sized_buffer(bytes: Vec<u8>) -> Result<SizedBuffer, DocumentError> {
    if bytes.len() < 8 {
        return Err(DocumentError::Invalid("sized buffer header"));
    }
    let width = u32_at(&bytes, 0);
    let height = u32_at(&bytes, 4);
    if !(1..=16_384).contains(&width) || !(1..=16_384).contains(&height) {
        return Err(DocumentError::Limit("atlas dimensions"));
    }
    Ok(SizedBuffer {
        width,
        height,
        data: bytes[8..].to_vec(),
    })
}

fn check_curve_origin(x: u16, y: u16, atlas: &SizedBuffer) -> Result<(), DocumentError> {
    if u32::from(x) + 2 >= atlas.width || u32::from(y) >= atlas.height {
        return Err(DocumentError::Invalid("curve atlas reference"));
    }
    Ok(())
}

fn expand_glyphs(glyphs: &[u8]) -> (Vec<u8>, Vec<f32>, Vec<f32>) {
    let count = glyphs.len() / 20;
    let mut vertices = Vec::with_capacity(count * 72);
    let mut positions_x = Vec::with_capacity(count);
    let mut positions_y = Vec::with_capacity(count);
    for record in glyphs.chunks_exact(20) {
        let x = u16_at(record, 0) as i16;
        let y = u16_at(record, 2) as i16;
        let dx = u16_at(record, 8) as i16;
        let dy = u16_at(record, 10) as i16;
        let ex = u16_at(record, 12) as i16;
        let ey = u16_at(record, 14) as i16;
        // Match JS double arithmetic before the final Float32Array assignment.
        positions_x
            .push(((f64::from(x) + 0.5 * (f64::from(dx) + f64::from(ex))) / 32767.0 + 0.5) as f32);
        positions_y
            .push(((f64::from(y) + 0.5 * (f64::from(dy) + f64::from(ey))) / 32767.0 + 0.5) as f32);
        for corner in [0u16, 1, 2, 3, 2, 1] {
            let (vx, vy) = match corner {
                1 => (x.wrapping_add(dx), y.wrapping_add(dy)),
                2 => (x.wrapping_add(ex), y.wrapping_add(ey)),
                3 => (
                    x.wrapping_add(dx).wrapping_add(ex),
                    y.wrapping_add(dy).wrapping_add(ey),
                ),
                _ => (x, y),
            };
            vertices.extend_from_slice(&vx.to_le_bytes());
            vertices.extend_from_slice(&vy.to_le_bytes());
            vertices.extend_from_slice(&(u16_at(record, 4) * 2 + (corner & 1)).to_le_bytes());
            vertices
                .extend_from_slice(&(u16_at(record, 6) * 2 + u16::from(corner > 1)).to_le_bytes());
            vertices.extend_from_slice(&record[16..20]);
        }
    }
    (vertices, positions_x, positions_y)
}
