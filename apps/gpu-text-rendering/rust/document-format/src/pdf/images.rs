//! Resolves PDF color spaces and image masks once, retaining source resolution.

use crate::{
    error::DocumentError,
    raster::{Images, MAX_ENCODED_IMAGE_BYTES, pixel_bytes},
};
use hayro_interpret::{CacheKey, Image, ImageData, LumaData, Paint};
use kurbo::Affine;
use std::collections::HashMap;

/// Deduplicates raster resources independently of placement and stencil paint.
#[derive(Default)]
pub(super) struct ImageCache(HashMap<u128, ImageRecord>);

/// The decoded pixels' unit square, mapped back into Hayro's image-pixel coordinates.
#[derive(Clone, Copy)]
pub(super) struct ImageRecord {
    pub index: u32,
    pub from_unit: Affine,
}

impl ImageCache {
    pub fn resolve(
        &mut self,
        image: Image<'_, '_>,
        images: &mut Images,
    ) -> Result<(ImageRecord, [f32; 4]), DocumentError> {
        let key = image.cache_key();
        let cached = self.0.get(&key).copied();
        if let (Image::Raster(_), Some(record)) = (&image, cached) {
            return Ok((record, [1.0; 4]));
        }
        pixel_bytes(image.width(), image.height())?;
        // Very wide/tall JPEGs exceed browser Canvas2D limits. Decode them here into
        // the bounded lossless tile path, retaining every source pixel.
        if let Image::Raster(raster) = &image
            && image.width() <= 16384
            && image.height() <= 16384
            && let Some(record) = retain_jpeg(raster, images)?
        {
            self.0.insert(key, record);
            return Ok((record, [1.0; 4]));
        }
        let mut result = Err(DocumentError::Invalid("PDF image could not be decoded"));
        match image {
            Image::Raster(image) => image.with_rgba(
                |data, alpha| {
                    result = append(images, &data, alpha.as_ref(), false).map(|r| (r, [1.0; 4]));
                },
                None,
            ),
            Image::Stencil(image) => image.with_stencil(
                |mask, paint| {
                    let Paint::Color(color) = paint else {
                        result = Err(DocumentError::Unsupported("pattern-painted image masks"));
                        return;
                    };
                    let mut tint = color.to_rgba().components();
                    // Hayro wraps image draws in a group with this same non-stroking alpha.
                    // Apply it at group pop, once, just as for ordinary raster images.
                    tint[3] = 1.0;
                    result = cached
                        .map_or_else(|| append(images, &ImageData::Luma(mask), None, true), Ok)
                        .map(|r| (r, tint));
                },
                None,
            ),
        }
        let (record, tint) = result?;
        self.0.insert(key, record);
        Ok((record, tint))
    }
}

fn append(
    images: &mut Images,
    data: &ImageData,
    alpha: Option<&LumaData>,
    stencil: bool,
) -> Result<ImageRecord, DocumentError> {
    let (width, height) = (data.width(), data.height());
    let size = pixel_bytes(width, height)?;
    if images.table.len() / 24 >= 10_000 {
        return Err(DocumentError::Limit("decoded image pixels/resources"));
    }
    if let Some(mask) = alpha {
        pixel_bytes(mask.width, mask.height)?;
    }
    let index = (images.table.len() / 24) as u32;
    let mut pixels = Vec::with_capacity(size);
    for i in 0..size / 4 {
        let (rgb, a) = match data {
            ImageData::Rgb(data) => (
                [data.data[i * 3], data.data[i * 3 + 1], data.data[i * 3 + 2]],
                255,
            ),
            ImageData::Luma(data) if stencil => ([255; 3], data.data[i]),
            ImageData::Luma(data) => ([data.data[i]; 3], 255),
        };
        let a = alpha.map_or(a, |mask| {
            sample_mask(mask, i as u32 % width, i as u32 / width, width, height)
        });
        for c in rgb {
            pixels.push(((u16::from(c) * u16::from(a) + 127) / 255) as u8);
        }
        pixels.push(a);
    }
    let mut codec = u32::from(size > 256 * 1024);
    let mut payload = if codec == 1 {
        miniz_oxide::deflate::compress_to_vec_zlib(&pixels, 6)
    } else {
        pixels.clone()
    };
    // Keep retained JPEGs unchanged. For decoded images, use independent tiles when their
    // lossless pyramid fits the remaining document budget without excessive storage amplification.
    if size > 256 * 1024
        && let Ok(tiled) = crate::raster_tiles::encode(width, height, &pixels)
        && tiled.len() <= payload.len().saturating_mul(2).max(16 * 1024)
        && tiled.len() <= MAX_ENCODED_IMAGE_BYTES.saturating_sub(images.pixels.len())
    {
        codec = 4;
        payload = tiled;
    }
    if payload.len() > MAX_ENCODED_IMAGE_BYTES.saturating_sub(images.pixels.len()) {
        return Err(DocumentError::Limit("encoded image resources"));
    }
    for n in [
        width,
        height,
        images.pixels.len() as u32,
        payload.len() as u32,
        u32::from(data.interpolate()),
        codec,
    ] {
        images.table.extend_from_slice(&n.to_le_bytes());
    }
    append_payload(images, &payload)?;
    let (sx, sy) = data.scale_factors();
    Ok(ImageRecord {
        index,
        from_unit: Affine::scale_non_uniform(
            f64::from(width) * f64::from(sx),
            f64::from(height) * f64::from(sy),
        ),
    })
}

// Avoid geometric Vec growth: a 600 MiB payload must not reserve a 1.2 GiB block
// while the input PDF and the previous allocation still occupy the WASM heap.
fn append_payload(images: &mut Images, payload: &[u8]) -> Result<(), DocumentError> {
    let needed = images
        .pixels
        .len()
        .checked_add(payload.len())
        .ok_or(DocumentError::Limit("encoded image resources"))?;
    if needed > images.pixels.capacity() {
        let capacity = needed
            .next_multiple_of(16 * 1024 * 1024)
            .min(MAX_ENCODED_IMAGE_BYTES);
        images
            .pixels
            .try_reserve_exact(capacity.saturating_sub(images.pixels.len()))
            .map_err(|_| DocumentError::Limit("image storage memory"))?;
    }
    images.pixels.extend_from_slice(payload);
    Ok(())
}

// PDF soft masks can have a different resolution. Sample their pixel centers in image UV space.
fn sample_mask(mask: &LumaData, x: u32, y: u32, width: u32, height: u32) -> u8 {
    let px = (f64::from(x) + 0.5) * f64::from(mask.width) / f64::from(width) - 0.5;
    let py = (f64::from(y) + 0.5) * f64::from(mask.height) / f64::from(height) - 0.5;
    let at = |x: f64, y: f64| -> f64 {
        let x = x.clamp(0.0, f64::from(mask.width - 1)) as usize;
        let y = y.clamp(0.0, f64::from(mask.height - 1)) as usize;
        f64::from(mask.data[y * mask.width as usize + x])
    };
    if !mask.interpolate {
        return at(px.round(), py.round()) as u8;
    }
    let (x0, y0) = (px.floor(), py.floor());
    let (fx, fy) = (px - x0, py - y0);
    let top = at(x0, y0) * (1.0 - fx) + at(x0 + 1.0, y0) * fx;
    let bottom = at(x0, y0 + 1.0) * (1.0 - fx) + at(x0 + 1.0, y0 + 1.0) * fx;
    (top * (1.0 - fy) + bottom * fy).round() as u8
}

// Retains JPEG samples only when their PDF color space can travel with the image and no masks/Decode mappings apply.
fn retain_jpeg(
    image: &hayro_interpret::RasterImage<'_>,
    images: &mut Images,
) -> Result<Option<ImageRecord>, DocumentError> {
    use hayro_interpret::hayro_syntax::{
        Filter,
        object::{Array, Name, Stream},
    };
    let stream = image.stream();
    let dict = stream.dict();
    let color = dict
        .get::<Name<'_>>(b"ColorSpace")
        .or_else(|| dict.get::<Name<'_>>(b"CS"));
    let cmyk = color
        .as_ref()
        .is_some_and(|name| matches!(name.as_ref(), b"DeviceCMYK" | b"CMYK"));
    let mut profile = if cmyk {
        Some(include_bytes!("../../assets/CGATS001Compat-v2-micro.icc").to_vec())
    } else {
        None
    };
    let mut compatible = color.is_some_and(|name| {
        matches!(
            name.as_ref(),
            b"DeviceRGB" | b"DeviceGray" | b"RGB" | b"G" | b"DeviceCMYK" | b"CMYK"
        )
    });
    if let Some(array) = dict.get::<Array<'_>>(b"ColorSpace") {
        let mut values = array.flex_iter();
        if values
            .next::<Name<'_>>()
            .is_some_and(|name| name.as_ref() == b"ICCBased")
            && let Some(icc) = values.next::<Stream<'_>>()
            && matches!(icc.dict().get::<u32>(b"N"), Some(1 | 3 | 4))
        {
            profile = icc.decoded().ok().map(|data| data.into_owned());
            compatible = profile
                .as_ref()
                .is_some_and(|data| data.len() <= 4 * 1024 * 1024);
        }
    }
    let filters = stream.filters();
    let Some((Filter::DctDecode, wrappers)) = filters.split_last() else {
        return Ok(None);
    };
    // ASCII wrappers do not alter JPEG samples. Leave other filter chains on the
    // general decoder path, including any predictor or color-transform parameters.
    if !wrappers
        .iter()
        .all(|filter| matches!(filter, Filter::Ascii85Decode | Filter::AsciiHexDecode))
        || !compatible
        || [
            b"Decode".as_slice(),
            b"D",
            b"Mask",
            b"SMask",
            b"DecodeParms",
            b"DP",
        ]
        .iter()
        .any(|key| dict.contains_key(key))
    {
        return Ok(None);
    }
    let raw = stream
        .decoded_prefix(wrappers.len())
        .map_err(|_| DocumentError::Invalid("PDF JPEG wrapper could not be decoded"))?;
    let Some((width, height)) = crate::raster::jpeg_dimensions(&raw) else {
        return Ok(None);
    };
    pixel_bytes(width, height)?;
    let mut payload = strip_jpeg_metadata(&raw);
    let codec = if let Some(profile) = profile {
        payload = with_jpeg_profile(&payload, &profile);
        3
    } else {
        2
    };
    if payload.len() > MAX_ENCODED_IMAGE_BYTES.saturating_sub(images.pixels.len())
        || images.table.len() / 24 >= 10_000
    {
        return Err(DocumentError::Limit("encoded image resources"));
    }
    let index = (images.table.len() / 24) as u32;
    let interpolate = dict
        .get::<bool>(b"Interpolate")
        .or_else(|| dict.get::<bool>(b"I"))
        .unwrap_or(false);
    for value in [
        width,
        height,
        images.pixels.len() as u32,
        payload.len() as u32,
        u32::from(interpolate),
        codec,
    ] {
        images.table.extend_from_slice(&value.to_le_bytes());
    }
    append_payload(images, &payload)?;
    Ok(Some(ImageRecord {
        index,
        from_unit: Affine::scale_non_uniform(f64::from(image.width()), f64::from(image.height())),
    }))
}

// PDF controls orientation and color space. EXIF/ICC metadata must not override it in a browser decoder.
fn strip_jpeg_metadata(bytes: &[u8]) -> Vec<u8> {
    let mut result = bytes[..2].to_vec();
    let mut offset = 2;
    while offset + 4 <= bytes.len() && bytes[offset] == 255 {
        let marker = bytes[offset + 1];
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        let length = u16::from_be_bytes([bytes[offset + 2], bytes[offset + 3]]) as usize;
        if length < 2 || offset + 2 + length > bytes.len() {
            break;
        }
        if !matches!(marker, 0xe1 | 0xe2) {
            result.extend_from_slice(&bytes[offset..offset + 2 + length]);
        }
        offset += 2 + length;
    }
    result.extend_from_slice(&bytes[offset..]);
    result
}

// JPEG APP2 carries the PDF's color profile; entropy-coded source samples remain unchanged.
fn with_jpeg_profile(jpeg: &[u8], profile: &[u8]) -> Vec<u8> {
    let chunks = profile.chunks(65_519);
    let count = chunks.len() as u8;
    let mut result = jpeg[..2].to_vec();
    for (index, chunk) in chunks.enumerate() {
        result.extend_from_slice(&[255, 226]);
        result.extend_from_slice(&((chunk.len() + 16) as u16).to_be_bytes());
        result.extend_from_slice(b"ICC_PROFILE\0");
        result.extend_from_slice(&[index as u8 + 1, count]);
        result.extend_from_slice(chunk);
    }
    result.extend_from_slice(&jpeg[2..]);
    result
}
