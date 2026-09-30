//! Resolves PDF color spaces and image masks once, retaining source resolution.

use crate::{
    error::DocumentError,
    raster::{Images, MAX_ENCODED_IMAGE_BYTES, pixel_bytes},
};
use hayro_interpret::{CacheKey, Image, ImageData, LumaData, Paint};
use kurbo::Affine;
use std::{
    borrow::Cow,
    collections::HashMap,
    hash::{DefaultHasher, Hash, Hasher},
};

/// Deduplicates raster resources independently of placement and stencil paint, and owns the
/// document's encoded-image budget.
pub(super) struct ImageCache {
    records: HashMap<u128, ImageRecord>,
    /// Content hash of interned generated resources (gradient ramps, solid fills) to indices.
    generated: HashMap<u64, Vec<u32>>,
    /// Maximum PIXL bytes: the format limit, reduced so input plus images fit WASM memory.
    budget: usize,
}

/// The decoded pixels' unit square, mapped back into Hayro's image-pixel coordinates.
#[derive(Clone, Copy)]
pub(super) struct ImageRecord {
    pub index: u32,
    pub from_unit: Affine,
}

/// Header fields of one generated image resource; `interpolate` and `codec` follow IMAG.
#[derive(Clone, Copy)]
pub(super) struct ResourceHeader {
    pub width: u32,
    pub height: u32,
    pub interpolate: bool,
    pub codec: u32,
}

impl ImageCache {
    /// Creates a cache whose encoded payload may not exceed `budget` bytes (capped at the
    /// format's 1536 MiB limit).
    pub fn new(budget: usize) -> Self {
        Self {
            records: HashMap::new(),
            generated: HashMap::new(),
            budget: budget.min(MAX_ENCODED_IMAGE_BYTES),
        }
    }

    /// Bytes still available in the image arena.
    pub fn remaining(&self, images: &Images) -> usize {
        self.budget.saturating_sub(images.pixels.len())
    }

    /// Converts a PDF image once per stream. Cached stencils only re-read their paint.
    ///
    /// # Errors
    /// `Limit` for oversized images/resources, `Unsupported` for pattern-painted stencils,
    /// `Invalid` when Hayro cannot decode the image.
    pub fn resolve(
        &mut self,
        image: Image<'_, '_>,
        images: &mut Images,
    ) -> Result<(ImageRecord, [f32; 4]), DocumentError> {
        let key = image.cache_key();
        if let Some(record) = self.records.get(&key).copied() {
            return match &image {
                Image::Raster(_) => Ok((record, [1.0; 4])),
                Image::Stencil(stencil) => stencil_tint(stencil.paint()).map(|tint| (record, tint)),
            };
        }
        pixel_bytes(image.width(), image.height())?;
        // Very wide/tall JPEGs exceed browser Canvas2D limits. Decode them here into
        // the bounded lossless tile path, retaining every source pixel.
        if let Image::Raster(raster) = &image
            && image.width() <= 16384
            && image.height() <= 16384
            && let Some(record) = self.retain_jpeg(raster, images)?
        {
            self.records.insert(key, record);
            return Ok((record, [1.0; 4]));
        }
        let mut result = Err(DocumentError::Invalid("PDF image could not be decoded"));
        match image {
            Image::Raster(image) => {
                let lossy = is_jpx(&image);
                image.with_rgba(
                    |data, alpha| {
                        result = self
                            .append(images, &data, alpha.as_ref(), false, lossy)
                            .map(|r| (r, [1.0; 4]));
                    },
                    None,
                );
            }
            Image::Stencil(image) => {
                let tint = stencil_tint(image.paint())?;
                image.with_stencil(
                    |mask, _| {
                        result = self
                            .append(images, &ImageData::Luma(mask), None, true, false)
                            .map(|r| (r, tint));
                    },
                    None,
                );
            }
        }
        let (record, tint) = result?;
        self.records.insert(key, record);
        Ok((record, tint))
    }

    /// Stores a generated resource, or returns an identical earlier one.
    ///
    /// A candidate is reused only when its header and payload bytes match and `same`
    /// accepts its index (callers use this to compare per-image side tables such as RGRD).
    ///
    /// # Errors
    /// `Limit(reason)` when the image table or arena budget is exhausted.
    pub fn intern(
        &mut self,
        images: &mut Images,
        header: ResourceHeader,
        payload: &[u8],
        reason: &'static str,
        same: impl Fn(u32) -> bool,
    ) -> Result<u32, DocumentError> {
        let mut hasher = DefaultHasher::new();
        (
            header.width,
            header.height,
            header.interpolate,
            header.codec,
        )
            .hash(&mut hasher);
        payload.hash(&mut hasher);
        let hash = hasher.finish();
        if let Some(candidates) = self.generated.get(&hash) {
            for &index in candidates {
                let record = &images.table[index as usize * 24..index as usize * 24 + 24];
                let offset = u32_at(record, 8) as usize;
                let stored = u32_at(record, 12) as usize;
                if [
                    u32_at(record, 0),
                    u32_at(record, 4),
                    u32_at(record, 16),
                    u32_at(record, 20),
                ] == [
                    header.width,
                    header.height,
                    u32::from(header.interpolate),
                    header.codec,
                ] && images.pixels.get(offset..offset + stored) == Some(payload)
                    && same(index)
                {
                    return Ok(index);
                }
            }
        }
        let index = self.push(images, header, payload, reason)?;
        self.generated.entry(hash).or_default().push(index);
        Ok(index)
    }

    /// Appends one table record and its payload without deduplication.
    ///
    /// # Errors
    /// `Limit(reason)` when the image table or arena budget is exhausted.
    pub fn push(
        &self,
        images: &mut Images,
        header: ResourceHeader,
        payload: &[u8],
        reason: &'static str,
    ) -> Result<u32, DocumentError> {
        if images.table.len() / 24 >= 10_000 || payload.len() > self.remaining(images) {
            return Err(DocumentError::Limit(reason));
        }
        let index = (images.table.len() / 24) as u32;
        let offset = images.pixels.len() as u32;
        self.append_payload(images, payload)?;
        for n in [
            header.width,
            header.height,
            offset,
            payload.len() as u32,
            u32::from(header.interpolate),
            header.codec,
        ] {
            images.table.extend_from_slice(&n.to_le_bytes());
        }
        Ok(index)
    }

    /// Encodes decoded samples as one resource. `lossy` marks a lossy source (JPEG 2000), whose
    /// opaque samples may be re-encoded as JPEG instead of lossless tiles.
    fn append(
        &self,
        images: &mut Images,
        data: &ImageData,
        alpha: Option<&LumaData>,
        stencil: bool,
        lossy: bool,
    ) -> Result<ImageRecord, DocumentError> {
        let (width, height) = (data.width(), data.height());
        let size = pixel_bytes(width, height)?;
        if images.table.len() / 24 >= 10_000 {
            return Err(DocumentError::Limit("decoded image pixels/resources"));
        }
        if let Some(mask) = alpha {
            pixel_bytes(mask.width, mask.height)?;
        }
        let samples = Samples::decode(data, alpha, stencil, size)?;
        let (codec, payload) = self.encode_pixels(images, width, height, &samples, lossy)?;
        let header = ResourceHeader {
            width,
            height,
            interpolate: data.interpolate(),
            codec,
        };
        let index = self.push(images, header, &payload, "encoded image resources")?;
        let (sx, sy) = data.scale_factors();
        Ok(ImageRecord {
            index,
            from_unit: Affine::scale_non_uniform(
                f64::from(width) * f64::from(sx),
                f64::from(height) * f64::from(sy),
            ),
        })
    }

    /// Small images stay raw RGBA. Larger opaque `lossy` sources within browser Canvas2D limits
    /// become baseline JPEG: storing a photographic JPEG 2000 losslessly takes about ten times
    /// its source size, so a scanned art book would exceed the image budget. Other large images
    /// use independent tiles when their lossless pyramid is at most twice its full-resolution
    /// tiles (16 KiB minimum allowance) and fits the remaining budget; only otherwise is the
    /// whole image zlib-compressed as RGBA.
    fn encode_pixels(
        &self,
        images: &Images,
        width: u32,
        height: u32,
        samples: &Samples<'_>,
        lossy: bool,
    ) -> Result<(u32, Vec<u8>), DocumentError> {
        if pixel_bytes(width, height)? <= 256 * 1024 {
            return Ok((0, samples.to_rgba()?));
        }
        if lossy
            && samples.channels != 4
            && width <= 16384
            && height <= 16384
            && let Some(jpeg) = encode_jpeg(width, height, samples)
        {
            return Ok((2, jpeg));
        }
        if let Ok((tiled, base)) =
            crate::raster_tiles::encode_with_base(width, height, samples.channels, &samples.bytes)
            && tiled.len() <= base.saturating_mul(2).max(16 * 1024)
            && tiled.len() <= self.remaining(images)
        {
            return Ok((4, tiled));
        }
        Ok((
            1,
            miniz_oxide::deflate::compress_to_vec_zlib(&samples.to_rgba()?, 6),
        ))
    }

    // Avoid geometric Vec growth: a 600 MiB payload must not reserve a 1.2 GiB block
    // while the input PDF and the previous allocation still occupy the WASM heap.
    fn append_payload(&self, images: &mut Images, payload: &[u8]) -> Result<(), DocumentError> {
        let needed = images
            .pixels
            .len()
            .checked_add(payload.len())
            .filter(|needed| *needed <= self.budget)
            .ok_or(DocumentError::Limit("encoded image resources"))?;
        if needed > images.pixels.capacity() {
            let capacity = needed.next_multiple_of(16 * 1024 * 1024).min(self.budget);
            images
                .pixels
                .try_reserve_exact(capacity.saturating_sub(images.pixels.len()))
                .map_err(|_| DocumentError::Limit("image storage memory"))?;
        }
        images.pixels.extend_from_slice(payload);
        Ok(())
    }
}

/// Whether Hayro decodes this image with the lossy JPEG 2000 filter.
fn is_jpx(image: &hayro_interpret::RasterImage<'_>) -> bool {
    use hayro_interpret::hayro_syntax::Filter;
    image
        .stream()
        .filters()
        .iter()
        .any(|filter| matches!(filter, Filter::JpxDecode))
}

/// Quality for re-encoded JPEG 2000 images: visually transparent for photographic scans while
/// keeping a 2650×3275 page near 1 MiB.
const JPEG_QUALITY: u8 = 90;

/// Baseline JPEG of opaque gray or RGB samples, or `None` if the encoder rejects them.
fn encode_jpeg(width: u32, height: u32, samples: &Samples<'_>) -> Option<Vec<u8>> {
    let color = match samples.channels {
        1 => jpeg_encoder::ColorType::Luma,
        3 => jpeg_encoder::ColorType::Rgb,
        _ => return None,
    };
    let mut jpeg = Vec::new();
    jpeg_encoder::Encoder::new(&mut jpeg, JPEG_QUALITY)
        .encode(&samples.bytes, width as u16, height as u16, color)
        .ok()?;
    Some(jpeg)
}

/// Stencils draw premultiplied white; the PDF color becomes the draw tint. Hayro wraps image
/// draws in a group with the same non-stroking alpha, applied once at group pop.
fn stencil_tint(paint: &Paint<'_>) -> Result<[f32; 4], DocumentError> {
    let Paint::Color(color) = paint else {
        return Err(DocumentError::Unsupported("pattern-painted image masks"));
    };
    let mut tint = color.to_rgba().components();
    tint[3] = 1.0;
    Ok(tint)
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    crate::container::u32_at(bytes, offset)
}

// PDF soft masks can have a different resolution. Sample their pixel centers in image UV space.
/// Decoded image samples in the fewest channels that represent them exactly: 1 for opaque
/// gray, 3 for opaque RGB, 4 for premultiplied RGBA. Opaque images borrow Hayro's buffer, so
/// scanned pages are never expanded to RGBA on the import path.
struct Samples<'a> {
    channels: usize,
    bytes: Cow<'a, [u8]>,
}

impl<'a> Samples<'a> {
    /// `size` is the image's RGBA byte count, already checked against the decoded-image limit.
    ///
    /// # Errors
    /// `Invalid` when Hayro returned fewer samples than the image dimensions need; `Limit`
    /// when a converted buffer cannot be allocated.
    fn decode(
        data: &'a ImageData,
        alpha: Option<&LumaData>,
        stencil: bool,
        size: usize,
    ) -> Result<Self, DocumentError> {
        let pixels = size / 4;
        let short = || DocumentError::Invalid("PDF image could not be decoded");
        match (data, alpha) {
            (ImageData::Rgb(data), None) => {
                let rgb = data.data.get(..pixels * 3).ok_or_else(short)?;
                // Branch-free per pixel so the scan vectorizes.
                let gray = rgb
                    .chunks_exact(3)
                    .fold(true, |gray, p| gray & (p[0] == p[1]) & (p[1] == p[2]));
                if !gray {
                    return Ok(Self {
                        channels: 3,
                        bytes: Cow::Borrowed(rgb),
                    });
                }
                let mut luma = reserve(pixels)?;
                luma.extend(rgb.chunks_exact(3).map(|p| p[0]));
                Ok(Self {
                    channels: 1,
                    bytes: Cow::Owned(luma),
                })
            }
            (ImageData::Luma(data), None) if !stencil => Ok(Self {
                channels: 1,
                bytes: Cow::Borrowed(data.data.get(..pixels).ok_or_else(short)?),
            }),
            _ => {
                let width = data.width();
                let height = data.height();
                let mut rgba = reserve(size)?;
                premultiply_into(&mut rgba, data, alpha, stencil, width, height);
                Ok(Self {
                    channels: 4,
                    bytes: Cow::Owned(rgba),
                })
            }
        }
    }

    /// Premultiplied RGBA for the raw and whole-image zlib codecs.
    fn to_rgba(&self) -> Result<Vec<u8>, DocumentError> {
        if self.channels == 4 {
            return Ok(self.bytes.to_vec());
        }
        let pixels = self.bytes.len() / self.channels;
        let mut rgba = reserve(pixels * 4)?;
        rgba.resize(pixels * 4, 255);
        for (rgba, sample) in rgba
            .chunks_exact_mut(4)
            .zip(self.bytes.chunks_exact(self.channels))
        {
            if self.channels == 1 {
                rgba[..3].fill(sample[0]);
            } else {
                rgba[..3].copy_from_slice(sample);
            }
        }
        Ok(rgba)
    }
}

/// An empty buffer with `capacity` bytes, or `Limit` instead of a WASM out-of-memory abort.
fn reserve(capacity: usize) -> Result<Vec<u8>, DocumentError> {
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(capacity)
        .map_err(|_| DocumentError::Limit("image storage memory"))?;
    Ok(bytes)
}

/// Converts masked, stencil or gray-with-alpha samples to premultiplied RGBA8, per pixel.
fn premultiply_into(
    pixels: &mut Vec<u8>,
    data: &ImageData,
    alpha: Option<&LumaData>,
    stencil: bool,
    width: u32,
    height: u32,
) {
    for i in 0..(width * height) as usize {
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
}

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

impl ImageCache {
    // Retains JPEG samples only when their PDF color space can travel with the image and no masks/Decode mappings apply.
    fn retain_jpeg(
        &self,
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
        // The JPEG's own component count must match the PDF color space; otherwise a browser
        // or the CMYK decoder would interpret the samples differently from DCTDecode.
        let mut components = color.and_then(|name| match name.as_ref() {
            b"DeviceGray" | b"G" => Some(1),
            b"DeviceRGB" | b"RGB" => Some(3),
            b"DeviceCMYK" | b"CMYK" => Some(4),
            _ => None,
        });
        if let Some(array) = dict.get::<Array<'_>>(b"ColorSpace") {
            let mut values = array.flex_iter();
            if values
                .next::<Name<'_>>()
                .is_some_and(|name| name.as_ref() == b"ICCBased")
                && let Some(icc) = values.next::<Stream<'_>>()
                && let Some(n @ (1 | 3 | 4)) = icc.dict().get::<u8>(b"N")
            {
                profile = icc.decoded().ok().map(|data| data.into_owned());
                components = profile
                    .as_ref()
                    .is_some_and(|data| data.len() <= 4 * 1024 * 1024)
                    .then_some(n);
            }
        }
        let Some(components) = components else {
            return Ok(None);
        };
        let filters = stream.filters();
        let Some((Filter::DctDecode, wrappers)) = filters.split_last() else {
            return Ok(None);
        };
        // ASCII wrappers do not alter JPEG samples. Leave other filter chains on the
        // general decoder path, including any predictor or color-transform parameters.
        if !wrappers
            .iter()
            .all(|filter| matches!(filter, Filter::Ascii85Decode | Filter::AsciiHexDecode))
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
        let Some(frame) = crate::raster::jpeg_frame(&raw).filter(|f| f.components == components)
        else {
            return Ok(None);
        };
        let (width, height) = (frame.width, frame.height);
        pixel_bytes(width, height)?;
        let mut payload = strip_jpeg_metadata(&raw);
        let codec = if let Some(profile) = profile {
            payload = with_jpeg_profile(&payload, &profile);
            3
        } else {
            2
        };
        let interpolate = dict
            .get::<bool>(b"Interpolate")
            .or_else(|| dict.get::<bool>(b"I"))
            .unwrap_or(false);
        let header = ResourceHeader {
            width,
            height,
            interpolate,
            codec,
        };
        let index = self.push(images, header, &payload, "encoded image resources")?;
        Ok(Some(ImageRecord {
            index,
            from_unit: Affine::scale_non_uniform(
                f64::from(image.width()),
                f64::from(image.height()),
            ),
        }))
    }
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
