//! PDF CMYK JPEG samples must reach the ICC transform without a standalone JPEG reader's inversion.

use crate::{
    error::DocumentError,
    raster::{MAX_PIXEL_BYTES, pixel_bytes},
};
use moxcms::{ColorProfile, DataColorSpace, Layout, TransformOptions};
use zune_jpeg::{
    JpegDecoder,
    zune_core::{bytestream::ZCursor, colorspace::ColorSpace, options::DecoderOptions},
};

/// Decodes retained four-component PDF JPEGs to opaque sRGB RGBA8, honoring the embedded PDF ICC profile.
/// PDF Decode mappings are already excluded by the retained-JPEG writer. Both dimensions are checked before allocation.
pub fn decode(bytes: &[u8], width: u32, height: u32) -> Result<Vec<u8>, DocumentError> {
    let size = pixel_bytes(width, height)?;
    if bytes.len() > MAX_PIXEL_BYTES {
        return Err(DocumentError::Limit("encoded JPEG"));
    }
    let options = DecoderOptions::default()
        .set_max_width(width as usize)
        .set_max_height(height as usize);
    let mut decoder = JpegDecoder::new_with_options(ZCursor::new(bytes), options);
    decoder
        .decode_headers()
        .map_err(|_| DocumentError::Invalid("CMYK JPEG header"))?;
    let input = decoder
        .input_colorspace()
        .ok_or(DocumentError::Invalid("JPEG color space"))?;
    if decoder.dimensions() != Some((width as usize, height as usize))
        || decoder.info().is_none_or(|info| info.components != 4)
        || !matches!(input, ColorSpace::CMYK | ColorSpace::YCCK)
    {
        return Err(DocumentError::Invalid("CMYK JPEG dimensions/components"));
    }
    decoder.set_options(options.jpeg_set_out_colorspace(input));
    let mut components = decoder
        .decode()
        .map_err(|_| DocumentError::Invalid("CMYK JPEG pixels"))?;
    if components.len() != size {
        return Err(DocumentError::Invalid("CMYK JPEG decoded length"));
    }
    // Match PDF DCTDecode: YCCK becomes CMYK, while K and the PDF's default Decode range stay unchanged.
    if input == ColorSpace::YCCK {
        for pixel in components.chunks_exact_mut(4) {
            let (y, cb, cr) = (
                f32::from(pixel[0]),
                f32::from(pixel[1]),
                f32::from(pixel[2]),
            );
            pixel[0] = (434.456 - y - 1.402 * cr) as u8;
            pixel[1] = (119.541 - y + 0.344 * cb + 0.714 * cr) as u8;
            pixel[2] = (481.816 - y - 1.772 * cb) as u8;
        }
    }
    let profile = embedded_profile(bytes)?;
    let profile = ColorProfile::new_from_slice(&profile)
        .map_err(|_| DocumentError::Invalid("JPEG ICC profile"))?;
    if profile.color_space != DataColorSpace::Cmyk {
        return Err(DocumentError::Invalid(
            "four-component JPEG ICC color space",
        ));
    }
    // moxcms uses the four-channel Rgba layout for a CMYK profile; its fourth input is K, not alpha.
    let transform = profile
        .create_transform_8bit(
            Layout::Rgba,
            &ColorProfile::new_srgb(),
            Layout::Rgb,
            TransformOptions::default(),
        )
        .map_err(|_| DocumentError::Invalid("CMYK ICC transform"))?;
    let mut rgb = vec![0; size / 4 * 3];
    transform
        .transform(&components, &mut rgb)
        .map_err(|_| DocumentError::Invalid("CMYK color conversion"))?;
    for (rgba, rgb) in components.chunks_exact_mut(4).zip(rgb.chunks_exact(3)) {
        rgba[..3].copy_from_slice(rgb);
        rgba[3] = 255;
    }
    Ok(components)
}

fn embedded_profile(bytes: &[u8]) -> Result<Vec<u8>, DocumentError> {
    let mut chunks = std::collections::BTreeMap::new();
    let mut count = None;
    let mut offset = 2;
    let mut total = 0;
    while offset + 4 <= bytes.len() && bytes[offset] == 255 {
        let marker = bytes[offset + 1];
        if matches!(marker, 0xda | 0xd9) {
            break;
        }
        let length = u16::from_be_bytes([bytes[offset + 2], bytes[offset + 3]]) as usize;
        if length < 2 || length > bytes.len() - offset - 2 {
            return Err(DocumentError::Invalid("JPEG marker length"));
        }
        let data = &bytes[offset + 4..offset + 2 + length];
        if marker == 0xe2 && data.starts_with(b"ICC_PROFILE\0") {
            if data.len() < 14
                || data[12] == 0
                || data[12] > data[13]
                || count.is_some_and(|count| count != data[13])
                || chunks.insert(data[12], &data[14..]).is_some()
            {
                return Err(DocumentError::Invalid("JPEG ICC chunks"));
            }
            count = Some(data[13]);
            total += data.len() - 14;
            if total > 4 * 1024 * 1024 {
                return Err(DocumentError::Limit("JPEG ICC profile"));
            }
        }
        offset += 2 + length;
    }
    if count.is_some_and(|count| usize::from(count) != chunks.len()) {
        return Err(DocumentError::Invalid("incomplete JPEG ICC profile"));
    }
    if chunks.is_empty() {
        return Ok(include_bytes!("../assets/CGATS001Compat-v2-micro.icc").to_vec());
    }
    Ok(chunks
        .values()
        .flat_map(|chunk| chunk.iter().copied())
        .collect())
}
