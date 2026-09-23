//! Independently compressed, guttered RGBA tiles with a complete mip pyramid.

use crate::{
    container::u32_at,
    error::DocumentError,
    raster::{MAX_PIXEL_BYTES, pixel_bytes},
};

/// Encodes premultiplied RGBA without changing full-resolution samples. Each mip includes a one-pixel neighbor border.
pub fn encode(width: u32, height: u32, pixels: &[u8]) -> Result<Vec<u8>, DocumentError> {
    if pixels.len() != pixel_bytes(width, height)? || !premultiplied(pixels) {
        return Err(DocumentError::Invalid("tile source pixels"));
    }
    let shapes = shapes(width, height);
    let count: usize = shapes
        .iter()
        .map(|&(w, h)| w.div_ceil(TILE) * h.div_ceil(TILE))
        .sum::<u32>() as usize;
    let mut out = vec![0; 16 + count * 8];
    put(&mut out, 0, TILE);
    put(&mut out, 4, shapes.len() as u32);
    put(&mut out, 8, count as u32);
    let mut current = pixels.to_vec();
    let mut index = 0;
    for (level, &(w, h)) in shapes.iter().enumerate() {
        for ty in 0..h.div_ceil(TILE) {
            for tx in 0..w.div_ceil(TILE) {
                let tw = (w - tx * TILE).min(TILE) + 2;
                let th = (h - ty * TILE).min(TILE) + 2;
                let mut tile = Vec::with_capacity((tw * th * 4) as usize);
                for y in 0..th {
                    let sy = (ty * TILE + y).saturating_sub(1).min(h - 1);
                    for x in 0..tw {
                        let sx = (tx * TILE + x).saturating_sub(1).min(w - 1);
                        let offset = ((sy * w + sx) * 4) as usize;
                        tile.extend_from_slice(&current[offset..offset + 4]);
                    }
                }
                let packed = miniz_oxide::deflate::compress_to_vec_zlib(&tile, 6);
                if packed.len() > MAX_PIXEL_BYTES.saturating_sub(out.len()) {
                    return Err(DocumentError::Limit("encoded tile pyramid"));
                }
                let offset = out.len() as u32;
                put(&mut out, 16 + index * 8, offset);
                put(&mut out, 20 + index * 8, packed.len() as u32);
                out.extend_from_slice(&packed);
                index += 1;
            }
        }
        if let Some(&(nw, nh)) = shapes.get(level + 1) {
            let mut next = vec![0; (nw * nh * 4) as usize];
            for y in 0..nh {
                for x in 0..nw {
                    let (left, right) = (x * w / nw, (x + 1) * w / nw);
                    let (top, bottom) = (y * h / nh, (y + 1) * h / nh);
                    let count = (right - left) * (bottom - top);
                    for c in 0..4 {
                        let mut sum = 0u32;
                        for sy in top..bottom {
                            for sx in left..right {
                                sum += u32::from(current[((sy * w + sx) * 4 + c) as usize]);
                            }
                        }
                        next[((y * nw + x) * 4 + c) as usize] = ((sum + count / 2) / count) as u8;
                    }
                }
            }
            current = next;
        }
    }
    Ok(out)
}

/// Checks canonical ordering, exact ranges, bounded inflation and premultiplication for every tile before worker access.
pub fn validate(width: u32, height: u32, bytes: &[u8]) -> Result<(), DocumentError> {
    pixel_bytes(width, height)?;
    let shapes = shapes(width, height);
    let count = shapes
        .iter()
        .map(|&(w, h)| w.div_ceil(TILE) * h.div_ceil(TILE))
        .sum::<u32>() as usize;
    let mut next = 16 + count * 8;
    if bytes.len() < next
        || bytes.len() > MAX_PIXEL_BYTES
        || u32_at(bytes, 0) != TILE
        || u32_at(bytes, 4) as usize != shapes.len()
        || u32_at(bytes, 8) as usize != count
        || u32_at(bytes, 12) != 0
    {
        return Err(DocumentError::Invalid("tile pyramid header"));
    }
    let mut index = 0;
    for (w, h) in shapes {
        for y in 0..h.div_ceil(TILE) {
            for x in 0..w.div_ceil(TILE) {
                let length = u32_at(bytes, 20 + index * 8) as usize;
                if u32_at(bytes, 16 + index * 8) as usize != next
                    || length > bytes.len().saturating_sub(next)
                {
                    return Err(DocumentError::Invalid("tile byte range"));
                }
                let size =
                    (((w - x * TILE).min(TILE) + 2) * ((h - y * TILE).min(TILE) + 2) * 4) as usize;
                let pixels = miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(
                    &bytes[next..next + length],
                    size,
                )
                .map_err(|_| DocumentError::Invalid("compressed tile pixels"))?;
                if pixels.len() != size || !premultiplied(&pixels) {
                    return Err(DocumentError::Invalid("tile pixels/length"));
                }
                next += length;
                index += 1;
            }
        }
    }
    if next != bytes.len() {
        return Err(DocumentError::Invalid("unassigned tile bytes"));
    }
    Ok(())
}

fn shapes(mut w: u32, mut h: u32) -> Vec<(u32, u32)> {
    let mut result = vec![(w, h)];
    while w > 1 || h > 1 {
        w = (w / 2).max(1);
        h = (h / 2).max(1);
        result.push((w, h));
    }
    result
}

fn premultiplied(pixels: &[u8]) -> bool {
    pixels
        .chunks_exact(4)
        .all(|p| p[..3].iter().all(|c| *c <= p[3]))
}

fn put(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

const TILE: u32 = 128;
