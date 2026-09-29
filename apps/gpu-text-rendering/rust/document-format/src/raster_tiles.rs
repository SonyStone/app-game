//! Independently compressed, guttered RGBA tiles with a complete mip pyramid.

use crate::{
    container::u32_at,
    error::DocumentError,
    raster::{MAX_PIXEL_BYTES, pixel_bytes},
};

/// Encodes premultiplied RGBA without changing full-resolution samples. Each mip includes a one-pixel neighbor border.
pub fn encode(width: u32, height: u32, pixels: &[u8]) -> Result<Vec<u8>, DocumentError> {
    encode_with_base(width, height, pixels).map(|(bytes, _)| bytes)
}

/// Like [`encode`], also returning the compressed byte count of the full-resolution level.
/// Callers use it to judge mip/border storage overhead without compressing the image twice.
pub(crate) fn encode_with_base(
    width: u32,
    height: u32,
    pixels: &[u8],
) -> Result<(Vec<u8>, usize), DocumentError> {
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
    // Level 0 is read in place; only the (at most one-third size) mips are owned copies.
    let mut current = std::borrow::Cow::Borrowed(pixels);
    let mut index = 0;
    let mut base = 0;
    for (level, &(w, h)) in shapes.iter().enumerate() {
        for ty in 0..h.div_ceil(TILE) {
            for tx in 0..w.div_ceil(TILE) {
                let tile = guttered_tile(&current, w, h, tx, ty);
                let packed = miniz_oxide::deflate::compress_to_vec_zlib(&tile, TILE_LEVEL);
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
            current = std::borrow::Cow::Owned(downsample(&current, w, h, nw, nh));
        }
        if level == 0 {
            base = out.len();
        }
    }
    Ok((out, base))
}

/// Copies one tile with a one-pixel border, repeating edge pixels outside the image.
fn guttered_tile(pixels: &[u8], w: u32, h: u32, tx: u32, ty: u32) -> Vec<u8> {
    let tw = (w - tx * TILE).min(TILE) + 2;
    let th = (h - ty * TILE).min(TILE) + 2;
    // Source columns first..=last are contiguous; clamped borders repeat column 0 or w - 1.
    let first = (tx * TILE).saturating_sub(1) as usize;
    let last = (tx * TILE + tw - 2).min(w - 1) as usize;
    let repeat_left = tx == 0;
    let repeat_right = tx * TILE + tw - 2 > w - 1;
    let mut tile = Vec::with_capacity((tw * th * 4) as usize);
    for y in 0..th {
        let row = &pixels[((ty * TILE + y).saturating_sub(1).min(h - 1) * w * 4) as usize..];
        if repeat_left {
            tile.extend_from_slice(&row[..4]);
        }
        tile.extend_from_slice(&row[first * 4..(last + 1) * 4]);
        if repeat_right {
            tile.extend_from_slice(&row[last * 4..(last + 1) * 4]);
        }
    }
    tile
}

/// Box-filters one mip level; each target pixel averages its (2 or 3)² source block, rounded.
fn downsample(pixels: &[u8], w: u32, h: u32, nw: u32, nh: u32) -> Vec<u8> {
    let mut next = Vec::with_capacity((nw * nh * 4) as usize);
    for y in 0..nh {
        let (top, bottom) = (y * h / nh, (y + 1) * h / nh);
        for x in 0..nw {
            let (left, right) = (x * w / nw, (x + 1) * w / nw);
            let count = (right - left) * (bottom - top);
            let mut sum = [0u32; 4];
            for sy in top..bottom {
                let row = &pixels[((sy * w + left) * 4) as usize..((sy * w + right) * 4) as usize];
                for pixel in row.chunks_exact(4) {
                    for (total, &value) in sum.iter_mut().zip(pixel) {
                        *total += u32::from(value);
                    }
                }
            }
            next.extend(sum.map(|total| ((total + count / 2) / count) as u8));
        }
    }
    next
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

/// Deflate effort for tile payloads. Imported photographs rarely repeat, so level 6's lazy
/// matching took ~2.3x level 1's time for ~12% smaller tiles; import time dominated.
const TILE_LEVEL: u8 = 1;
