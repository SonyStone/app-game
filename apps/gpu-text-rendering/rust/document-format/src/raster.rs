//! Profile 3 image resources: raw/packed premultiplied RGBA8 or retained JPEG with an explicit color policy.

use crate::{container::u32_at, error::DocumentError};

/// Shared image payloads; drawing instances refer to a 24-byte table record by index.
#[derive(Debug, Default, Clone)]
pub struct Images {
    /// Width, height, byte offset, stored byte length, interpolation (0/1), codec (0 raw, 1 zlib RGBA, 2 RGB/gray JPEG, 3 ICC JPEG, 4 tiled mip pyramid).
    pub table: Vec<u8>,
    /// Contiguous independently encoded images; expansion is bounded per resource.
    pub pixels: Vec<u8>,
}

impl Images {
    /// Checks all byte ranges and dimensions before transferring or allocating GPU resources.
    pub fn validate(&self) -> Result<(), DocumentError> {
        if !self.table.len().is_multiple_of(24) || self.table.len() / 24 > 10_000 {
            return Err(DocumentError::Invalid("image table"));
        }
        let mut next = 0usize;
        for record in self.table.chunks_exact(24) {
            let size = pixel_bytes(u32_at(record, 0), u32_at(record, 4))?;
            let stored = u32_at(record, 12) as usize;
            let codec = u32_at(record, 20);
            if u32_at(record, 8) as usize != next
                || u32_at(record, 16) > 1
                || codec > 4
                || stored > self.pixels.len().saturating_sub(next)
            {
                return Err(DocumentError::Invalid("image range/flags"));
            }
            let payload = &self.pixels[next..next + stored];
            if codec == 4 {
                crate::raster_tiles::validate(u32_at(record, 0), u32_at(record, 4), payload)?;
                next += stored;
                continue;
            }
            if codec >= 2 {
                if jpeg_dimensions(payload) != Some((u32_at(record, 0), u32_at(record, 4))) {
                    return Err(DocumentError::Invalid("JPEG dimensions/header"));
                }
                next += stored;
                continue;
            }
            let decoded;
            let pixels = if codec == 1 {
                decoded = miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(payload, size)
                    .map_err(|_| DocumentError::Invalid("compressed image pixels"))?;
                decoded.as_slice()
            } else {
                payload
            };
            if pixels.len() != size
                || pixels
                    .chunks_exact(4)
                    .any(|p| p[..3].iter().any(|c| *c > p[3]))
            {
                return Err(DocumentError::Invalid("image pixels/length"));
            }
            next += stored;
        }
        if next != self.pixels.len() {
            return Err(DocumentError::Invalid("unassigned image pixels"));
        }
        if next > MAX_ENCODED_IMAGE_BYTES {
            return Err(DocumentError::Limit("encoded image resources"));
        }
        Ok(())
    }
}

/// Bounds decoded image allocations independently of compressed PDF/GDOC size.
pub fn pixel_bytes(width: u32, height: u32) -> Result<usize, DocumentError> {
    if width == 0 || height == 0 || width > 65535 || height > 65535 {
        return Err(DocumentError::Limit("image dimensions/pixels"));
    }
    let size = u64::from(width) * u64::from(height) * 4;
    if size > MAX_PIXEL_BYTES as u64 {
        return Err(DocumentError::Limit("image dimensions/pixels"));
    }
    Ok(size as usize)
}

/// Bounds one decoded image independently of the total encoded resource payload.
pub const MAX_PIXEL_BYTES: usize = 128 * 1024 * 1024;

/// Bounds all encoded image resources; the container also checks total decoded section bytes.
pub const MAX_ENCODED_IMAGE_BYTES: usize = 1536 * 1024 * 1024;

/// Reads bounded JPEG frame dimensions without allocating decoded pixels.
pub fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if !bytes.starts_with(&[255, 216]) {
        return None;
    }
    let mut offset = 2;
    while offset + 4 <= bytes.len() && bytes[offset] == 255 {
        let marker = bytes[offset + 1];
        if marker == 0xda || marker == 0xd9 {
            return None;
        }
        let length = u16::from_be_bytes([bytes[offset + 2], bytes[offset + 3]]) as usize;
        if length < 2 || length > bytes.len() - offset - 2 {
            return None;
        }
        if matches!(marker, 0xc0..=0xc3)
            && length >= 8
            && bytes[offset + 4] == 8
            && matches!(bytes[offset + 9], 1 | 3 | 4)
        {
            return Some((
                u32::from(u16::from_be_bytes([bytes[offset + 7], bytes[offset + 8]])),
                u32::from(u16::from_be_bytes([bytes[offset + 5], bytes[offset + 6]])),
            ));
        }
        offset += 2 + length;
    }
    None
}
