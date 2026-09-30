//! Independently compressed, guttered tiles with a complete mip pyramid. Each tile stores
//! gray, opaque RGB or premultiplied RGBA samples, whichever reproduces it exactly.

use miniz_oxide::deflate::core::{
    CompressorOxide, TDEFLFlush, TDEFLStatus, compress, create_comp_flags_from_zip_params,
};

use crate::{
    container::u32_at,
    error::DocumentError,
    raster::{MAX_PIXEL_BYTES, pixel_bytes},
};

/// Encodes premultiplied RGBA without changing full-resolution samples. Each mip includes a one-pixel neighbor border;
/// each tile is stored with the fewest channels (gray, RGB or RGBA) that reproduce it exactly.
pub fn encode(width: u32, height: u32, pixels: &[u8]) -> Result<Vec<u8>, DocumentError> {
    encode_with_base(width, height, 4, pixels).map(|(bytes, _)| bytes)
}

/// Like [`encode`], also returning the compressed byte count of the full-resolution level.
/// Callers use it to judge mip/border storage overhead without compressing the image twice.
///
/// `channels` describes `pixels`: 1 opaque gray, 3 opaque RGB or 4 premultiplied RGBA. Gray
/// and RGB sources are filtered and tiled without ever being expanded to RGBA.
pub(crate) fn encode_with_base(
    width: u32,
    height: u32,
    channels: usize,
    pixels: &[u8],
) -> Result<(Vec<u8>, usize), DocumentError> {
    if !matches!(channels, 1 | 3 | 4)
        || pixels.len() != pixel_bytes(width, height)? / 4 * channels
        || (channels == 4 && !premultiplied(pixels))
    {
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
    put(&mut out, 12, CHANNEL_PREFIXED);
    // Level 0 is read in place; only the (at most one-third size) mips are owned copies.
    let mut current = std::borrow::Cow::Borrowed(pixels);
    let mut compressor = TileCompressor::new();
    let mut tile = Vec::new();
    let mut index = 0;
    let mut base = 0;
    for (level, &(w, h)) in shapes.iter().enumerate() {
        for ty in 0..h.div_ceil(TILE) {
            for tx in 0..w.div_ceil(TILE) {
                guttered_tile(&current, w, h, tx, ty, channels, &mut tile);
                let offset = out.len();
                out.push(pack_channels(&mut tile, channels));
                compressor.append(&tile, &mut out);
                if out.len() > MAX_PIXEL_BYTES {
                    return Err(DocumentError::Limit("encoded tile pyramid"));
                }
                let length = out.len() - offset;
                put(&mut out, 16 + index * 8, offset as u32);
                put(&mut out, 20 + index * 8, length as u32);
                index += 1;
            }
        }
        if let Some(&(nw, nh)) = shapes.get(level + 1) {
            current = std::borrow::Cow::Owned(match channels {
                1 => downsample::<1>(&current, w, h, nw, nh),
                3 => downsample::<3>(&current, w, h, nw, nh),
                _ => downsample::<4>(&current, w, h, nw, nh),
            });
        }
        if level == 0 {
            base = out.len();
        }
    }
    Ok((out, base))
}

/// Zlib compressor reused across tiles. A fresh one allocates and zeroes several hundred KiB
/// of match state, which cost more than compressing a 130×130 tile at [`TILE_LEVEL`].
struct TileCompressor(CompressorOxide);

impl TileCompressor {
    fn new() -> Self {
        let flags = create_comp_flags_from_zip_params(TILE_LEVEL.into(), 1, 0);
        Self(CompressorOxide::new(flags))
    }

    /// Appends one complete zlib stream for `input` to `out` and returns its length. Output is
    /// identical to `compress_to_vec_zlib` because `reset` clears all match history.
    fn append(&mut self, mut input: &[u8], out: &mut Vec<u8>) -> usize {
        self.0.reset();
        let start = out.len();
        let mut end = start;
        out.resize(start + (input.len() / 2).max(64), 0);
        loop {
            let (status, read, written) =
                compress(&mut self.0, input, &mut out[end..], TDEFLFlush::Finish);
            end += written;
            match status {
                TDEFLStatus::Done => break,
                TDEFLStatus::Okay => {
                    input = &input[read..];
                    if out.len() - end < 64 {
                        out.resize(out.len() + (out.len() - start).max(64), 0);
                    }
                }
                _ => unreachable!("in-memory deflate with Finish cannot fail"),
            }
        }
        out.truncate(end);
        end - start
    }
}

/// Copies one tile of `channels`-byte pixels with a one-pixel border into `tile`, repeating
/// edge pixels outside the image.
fn guttered_tile(
    pixels: &[u8],
    w: u32,
    h: u32,
    tx: u32,
    ty: u32,
    channels: usize,
    tile: &mut Vec<u8>,
) {
    let tw = (w - tx * TILE).min(TILE) + 2;
    let th = (h - ty * TILE).min(TILE) + 2;
    // Source columns first..=last are contiguous; clamped borders repeat column 0 or w - 1.
    let first = (tx * TILE).saturating_sub(1) as usize * channels;
    let last = (tx * TILE + tw - 2).min(w - 1) as usize * channels;
    let repeat_left = tx == 0;
    let repeat_right = tx * TILE + tw - 2 > w - 1;
    let stride = w as usize * channels;
    tile.clear();
    for y in 0..th {
        let row = (ty * TILE + y).saturating_sub(1).min(h - 1) as usize;
        let row = &pixels[row * stride..(row + 1) * stride];
        if repeat_left {
            tile.extend_from_slice(&row[..channels]);
        }
        tile.extend_from_slice(&row[first..last + channels]);
        if repeat_right {
            tile.extend_from_slice(&row[last..last + channels]);
        }
    }
}

/// Compacts a tile of `channels`-byte pixels in place to the fewest channels that keep it
/// exact and returns that count: 1 when every pixel is opaque gray, 3 when opaque, otherwise
/// 4. Colour pages often contain gray regions, whose tiles then shrink too.
fn pack_channels(tile: &mut Vec<u8>, channels: usize) -> u8 {
    match channels {
        1 => 1,
        3 => {
            // Branch-free per pixel so the scans vectorize.
            let gray = tile
                .chunks_exact(3)
                .fold(true, |gray, p| gray & (p[0] == p[1]) & (p[1] == p[2]));
            if gray {
                compact::<3, 1>(tile);
                1
            } else {
                3
            }
        }
        _ => {
            let (opaque, gray) = tile
                .chunks_exact(4)
                .fold((true, true), |(opaque, gray), p| {
                    (
                        opaque & (p[3] == 255),
                        gray & (p[0] == p[1]) & (p[1] == p[2]),
                    )
                });
            match (opaque, gray) {
                (false, _) => 4,
                (true, true) => {
                    compact::<4, 1>(tile);
                    1
                }
                (true, false) => {
                    compact::<4, 3>(tile);
                    3
                }
            }
        }
    }
}

/// Keeps the first `TO` of every `FROM` bytes. Destinations never pass their sources, so the
/// forward in-place copy is safe.
fn compact<const FROM: usize, const TO: usize>(tile: &mut Vec<u8>) {
    let pixels = tile.len() / FROM;
    for i in 0..pixels {
        for c in 0..TO {
            tile[i * TO + c] = tile[i * FROM + c];
        }
    }
    tile.truncate(pixels * TO);
}

/// Box-filters one mip level of `C`-byte pixels; each target pixel averages its (2 or 3)²
/// source block, rounded.
fn downsample<const C: usize>(pixels: &[u8], w: u32, h: u32, nw: u32, nh: u32) -> Vec<u8> {
    let (w, h, nw, nh) = (w as usize, h as usize, nw as usize, nh as usize);
    // Each level halves (rounding down, at least 1), so blocks are 1–3 pixels per side.
    let columns: Vec<_> = (0..nw).map(|x| (x * w / nw, (x + 1) * w / nw)).collect();
    let mut next = vec![0; nw * nh * C];
    for (y, target) in next.chunks_exact_mut(nw * C).enumerate() {
        let (top, bottom) = (y * h / nh, (y + 1) * h / nh);
        let row = |r: usize| &pixels[(top + r) * w * C..(top + r + 1) * w * C];
        match bottom - top {
            1 => average_row::<1, C>([row(0)], &columns, target),
            2 => average_row::<2, C>([row(0), row(1)], &columns, target),
            _ => average_row::<3, C>([row(0), row(1), row(2)], &columns, target),
        }
    }
    next
}

/// Writes one target row. Block sizes are compile-time constants, so the rounded division
/// becomes a multiply; almost every block is 2×2 or 2×3.
fn average_row<const ROWS: usize, const C: usize>(
    rows: [&[u8]; ROWS],
    columns: &[(usize, usize)],
    target: &mut [u8],
) {
    for (pixel, &(left, right)) in target.chunks_exact_mut(C).zip(columns) {
        let average = match right - left {
            1 => average_block::<ROWS, 1, C>(&rows, left),
            2 => average_block::<ROWS, 2, C>(&rows, left),
            _ => average_block::<ROWS, 3, C>(&rows, left),
        };
        pixel.copy_from_slice(&average);
    }
}

#[inline(always)]
fn average_block<const ROWS: usize, const COLUMNS: usize, const C: usize>(
    rows: &[&[u8]; ROWS],
    left: usize,
) -> [u8; C] {
    let count = (ROWS * COLUMNS) as u32;
    let mut sum = [0u32; C];
    for row in rows {
        for pixel in row[left * C..(left + COLUMNS) * C].chunks_exact(C) {
            for (total, &value) in sum.iter_mut().zip(pixel) {
                *total += u32::from(value);
            }
        }
    }
    sum.map(|total| ((total + count / 2) / count) as u8)
}

/// Returns whether a tiled payload stores a channel-count byte before each tile, which
/// requires `VTEX` version 2.
pub(crate) fn channel_prefixed(bytes: &[u8]) -> bool {
    bytes.len() >= 16 && u32_at(bytes, 12) == CHANNEL_PREFIXED
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
        || u32_at(bytes, 12) > CHANNEL_PREFIXED
    {
        return Err(DocumentError::Invalid("tile pyramid header"));
    }
    let prefixed = u32_at(bytes, 12) == CHANNEL_PREFIXED;
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
                let mut stream = &bytes[next..next + length];
                let channels = if prefixed {
                    let Some((&channels, rest)) = stream.split_first() else {
                        return Err(DocumentError::Invalid("tile channel count"));
                    };
                    stream = rest;
                    channels
                } else {
                    4
                };
                if !matches!(channels, 1 | 3 | 4) {
                    return Err(DocumentError::Invalid("tile channel count"));
                }
                let size = (((w - x * TILE).min(TILE) + 2) * ((h - y * TILE).min(TILE) + 2))
                    as usize
                    * usize::from(channels);
                let pixels = miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(stream, size)
                    .map_err(|_| DocumentError::Invalid("compressed tile pixels"))?;
                // Gray and RGB tiles are opaque, hence always premultiplied.
                if pixels.len() != size || (channels == 4 && !premultiplied(&pixels)) {
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

// Branch-free per pixel so the scan vectorizes; images are checked whole anyway.
fn premultiplied(pixels: &[u8]) -> bool {
    pixels.chunks_exact(4).fold(true, |ok, p| {
        ok & (p[0] <= p[3]) & (p[1] <= p[3]) & (p[2] <= p[3])
    })
}

fn put(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

const TILE: u32 = 128;

/// Header word 12: each tile starts with its channel count (1 gray, 3 RGB, 4 RGBA), then its
/// zlib stream. Zero is the original all-RGBA layout, still accepted from older files.
const CHANNEL_PREFIXED: u32 = 1;

/// Deflate effort for tile payloads. Imported photographs rarely repeat, so level 6's lazy
/// matching took ~2.3x level 1's time for ~12% smaller tiles; import time dominated.
const TILE_LEVEL: u8 = 1;
