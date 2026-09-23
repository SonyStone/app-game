//! PDF image conversion, painter ordering and hostile profile-3 records.
#![cfg(feature = "pdf")]

use gpu_document::{container, curves, pdf};

#[test]
fn retains_jpeg_samples_inside_ascii_wrappers() {
    let jpeg = include_bytes!("../../../tests/fixtures/jpeg/pdf-cmyk.jpg");
    let baseline =
        curves::decode(&pdf::convert(&jpeg_fixture("/DCTDecode", jpeg, "")).unwrap()).unwrap();
    let hex: String = jpeg.iter().map(|byte| format!("{byte:02X}")).collect();
    let hex = format!("{hex}>");
    for (filters, encoded) in [
        ("[/ASCII85Decode /DCTDecode]", ascii85(jpeg)),
        ("[/ASCIIHexDecode /DCTDecode]", hex.as_bytes().to_vec()),
        (
            "[/ASCII85Decode /ASCIIHexDecode /DCTDecode]",
            ascii85(hex.as_bytes()),
        ),
    ] {
        let source = jpeg_fixture(filters, &encoded, "");
        let scene = curves::decode(&pdf::convert(&source).unwrap()).unwrap();
        assert_eq!(u32_at(&scene.images.table, 20), 3, "{filters}");
        assert_eq!(scene.images.pixels, baseline.images.pixels, "{filters}");
    }
}

#[test]
fn wrapped_jpeg_decode_mapping_still_uses_pixel_conversion() {
    let jpeg = include_bytes!("../../../tests/fixtures/jpeg/pdf-cmyk.jpg");
    let source = jpeg_fixture(
        "[/ASCII85Decode /DCTDecode]",
        &ascii85(jpeg),
        "/Decode [1 0 1 0 1 0 1 0]",
    );
    let scene = curves::decode(&pdf::convert(&source).unwrap()).unwrap();
    assert_eq!(u32_at(&scene.images.table, 20), 0);
    let direct = jpeg_fixture("/DCTDecode", jpeg, "/Decode [1 0 1 0 1 0 1 0]");
    let expected = curves::decode(&pdf::convert(&direct).unwrap()).unwrap();
    assert_eq!(scene.images.pixels, expected.images.pixels);
}

fn jpeg_fixture(filters: &str, data: &[u8], extra: &str) -> Vec<u8> {
    let placeholder = "x".repeat(data.len());
    let mut source = fixture(
        "/Im Do",
        &format!(
            "<< /Type /XObject /Subtype /Image /Width 64 /Height 16 /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter {filters} {extra} /Length {} >>\nstream\n{placeholder}\nendstream",
            data.len()
        ),
        &[],
    );
    let offset = source
        .windows(placeholder.len())
        .position(|window| window == placeholder.as_bytes())
        .unwrap();
    source[offset..offset + data.len()].copy_from_slice(data);
    source
}

fn ascii85(data: &[u8]) -> Vec<u8> {
    let mut encoded = Vec::new();
    for chunk in data.chunks(4) {
        let mut padded = [0; 4];
        padded[..chunk.len()].copy_from_slice(chunk);
        let mut value = u32::from_be_bytes(padded);
        let mut digits = [0; 5];
        for digit in digits.iter_mut().rev() {
            *digit = (value % 85) as u8 + b'!';
            value /= 85;
        }
        encoded.extend_from_slice(&digits[..chunk.len() + 1]);
    }
    encoded.extend_from_slice(b"~>");
    encoded
}

#[test]
fn preserves_image_orientation_order_and_shared_resources() {
    let data = fixture(
        "0 0 1 rg 0 0 100 100 re f q 80 0 0 60 10 20 cm /Im Do Q 1 0 0 rg 20 30 40 20 re f q 20 0 0 20 0 0 cm /Im Do Q",
        &image(
            "/Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8",
            "FF000000FF000000FFFFFFFF",
        ),
        &[],
    );
    let bytes = pdf::convert(&data).unwrap();
    assert_eq!(u32_at(&bytes, 12), 3);
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(scene.pages[0].count, 4);
    assert_eq!(scene.images.table.len(), 24);
    assert_eq!(
        scene.images.pixels,
        [
            255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255
        ]
    );
    let kinds: Vec<_> = scene
        .instances
        .chunks_exact(80)
        .map(|r| u32_at(r, 72))
        .collect();
    assert_eq!(kinds, [0, 2, 0, 2]);
    let draw = &scene.instances[80..160];
    assert_eq!((f32_at(draw, 0), f32_at(draw, 12)), (0.8, 0.6));
    assert_eq!((f32_at(draw, 16), f32_at(draw, 20)), (0.1, 0.2));
    assert_eq!(u32_at(&scene.instances, 3 * 80 + 64), 0);
}

#[test]
fn decodes_inline_grayscale_and_cmyk_images() {
    for (content, expected) in [
        (
            "BI /W 1 /H 1 /CS /G /BPC 8 /F /AHx ID 80> EI",
            [128, 128, 128, 255],
        ),
        (
            "BI /W 1 /H 1 /CS /CMYK /BPC 8 /F /AHx ID 00000000> EI",
            [255, 255, 255, 255],
        ),
    ] {
        let bytes = pdf::convert(&fixture(
            content,
            &image(
                "/Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
                "FF",
            ),
            &[],
        ))
        .unwrap();
        let scene = curves::decode(&bytes).unwrap();
        assert_eq!(scene.images.pixels, expected);
    }
}

#[test]
fn retains_soft_mask_color_key_and_constant_opacity() {
    let mask = image(
        "/Width 2 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
        "0080",
    );
    let data = fixture(
        "/GS gs 100 0 0 100 0 0 cm /Im Do",
        &image(
            "/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 6 0 R",
            "FF000000FF00",
        ),
        &[mask],
    );
    let scene = curves::decode(&pdf::convert(&data).unwrap()).unwrap();
    assert_eq!(scene.images.pixels, [0, 0, 0, 0, 0, 128, 0, 128]);
    assert_eq!(f32_at(&scene.groups, 8), 0.5);

    let data = fixture(
        "/Im Do",
        &image(
            "/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Mask [255 255 0 0 0 0]",
            "FF000000FF00",
        ),
        &[],
    );
    let scene = curves::decode(&pdf::convert(&data).unwrap()).unwrap();
    assert_eq!(scene.images.pixels, [0, 0, 0, 0, 0, 255, 0, 255]);
}

#[test]
fn resamples_smaller_soft_masks_and_reuses_stencil_with_different_paints() {
    let mask = image(
        "/Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate true",
        "80",
    );
    let data = fixture(
        "/Im Do",
        &image(
            "/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 6 0 R",
            "FF000000FF00",
        ),
        &[mask],
    );
    let scene = curves::decode(&pdf::convert(&data).unwrap()).unwrap();
    assert_eq!(scene.images.pixels, [128, 0, 0, 128, 0, 128, 0, 128]);

    let data = fixture(
        "1 0 0 rg /Im Do 0 0 1 rg /GS gs /Im Do",
        &image(
            "/Width 2 /Height 1 /ImageMask true /BitsPerComponent 1",
            "40",
        ),
        &[],
    );
    let scene = curves::decode(&pdf::convert(&data).unwrap()).unwrap();
    assert_eq!(scene.images.table.len(), 24);
    assert_eq!(scene.images.pixels, [255, 255, 255, 255, 0, 0, 0, 0]);
    assert_eq!(
        (f32_at(&scene.instances, 32), f32_at(&scene.instances, 40)),
        (1.0, 0.0)
    );
    assert_eq!(
        (
            f32_at(&scene.instances, 80 + 32),
            f32_at(&scene.instances, 80 + 40),
            f32_at(&scene.instances, 80 + 44)
        ),
        (0.0, 1.0, 1.0)
    );
}

#[test]
fn rejects_invalid_image_tables_and_references_after_valid_checksums() {
    let bytes = pdf::convert(&fixture(
        "/Im Do",
        &image(
            "/Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8",
            "FF0000",
        ),
        &[],
    ))
    .unwrap();
    for (tag, offset, value) in [
        (*b"IMAG", 0, 0),
        (*b"IMAG", 4, 16385),
        (*b"IMAG", 8, 1),
        (*b"IMAG", 12, 8),
        (*b"IMAG", 16, 2),
        (*b"IMAG", 20, 1),
        (*b"DRAW", 64, 1),
        (*b"DRAW", 68, 1),
        (*b"DRAW", 72, 3),
        (*b"PIXL", 0, 0x000000ff),
    ] {
        let mut sections = container::decode_profile(&bytes, 3).unwrap();
        let section = sections.iter_mut().find(|s| s.tag == tag).unwrap();
        section.data[offset..offset + 4].copy_from_slice(&u32::to_le_bytes(value));
        assert!(
            curves::decode(&container::encode_profile(&sections, 3).unwrap()).is_err(),
            "accepted {tag:?} at {offset}"
        );
    }
    let mut sections = container::decode_profile(&bytes, 3).unwrap();
    sections.retain(|s| s.tag != *b"PIXL");
    assert!(curves::decode(&container::encode_profile(&sections, 3).unwrap()).is_err());
}

#[test]
fn rejects_oversized_images_before_decoding() {
    assert!(gpu_document::raster::pixel_bytes(u32::MAX, u32::MAX).is_err());
    let bytes = fixture(
        "/Im Do",
        &image(
            "/Width 65536 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
            "00",
        ),
        &[],
    );
    assert_eq!(pdf::convert(&bytes).unwrap_err().code(), "document-limit");
}

fn image(dict: &str, hex: &str) -> String {
    let data = format!("{hex}>");
    format!(
        "<< /Type /XObject /Subtype /Image {dict} /Filter /ASCIIHexDecode /Length {} >>\nstream\n{data}\nendstream",
        data.len()
    )
}

fn fixture(content: &str, image: &str, extra_objects: &[String]) -> Vec<u8> {
    let mut objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_owned(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Im 5 0 R >> /ExtGState << /GS << /ca 0.5 >> >> >> /Contents 4 0 R >>".to_owned(),
        format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
        image.to_owned(),
    ];
    objects.extend_from_slice(extra_objects);
    let mut out = "%PDF-1.7\n".to_owned();
    let mut offsets = vec![0];
    for (i, object) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.push_str(&format!("{} 0 obj\n{object}\nendobj\n", i + 1));
    }
    let xref = out.len();
    out.push_str(&format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len()));
    for offset in &offsets[1..] {
        out.push_str(&format!("{offset:010} 00000 n \n"));
    }
    out.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF",
        offsets.len()
    ));
    out.into_bytes()
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}

fn f32_at(bytes: &[u8], offset: usize) -> f32 {
    f32::from_bits(u32_at(bytes, offset))
}

#[test]
fn validates_independently_compressed_pixels_and_rejects_expansion_mismatch() {
    let pixels = vec![255; 512 * 512 * 4];
    let payload = miniz_oxide::deflate::compress_to_vec_zlib(&pixels, 6);
    let table: Vec<u8> = [512, 512, 0, payload.len() as u32, 1, 1]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect();
    let mut images = gpu_document::raster::Images {
        table,
        pixels: payload,
    };
    assert!(images.validate().is_ok());
    images.table[..4].copy_from_slice(&1u32.to_le_bytes());
    assert!(images.validate().is_err());
}

#[test]
fn writes_tiled_mips_with_a_required_extension_and_rejects_missing_capability() {
    let mut hex = String::new();
    // A reproducible source with enough entropy to exercise independently compressed storage.
    let mut random = 13u32;
    for _ in 0..513 * 257 {
        random = random.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        use std::fmt::Write;
        write!(&mut hex, "{:02X}", random >> 24).unwrap();
    }
    let source = fixture(
        "/Im Do",
        &image(
            "/Width 513 /Height 257 /ColorSpace /DeviceGray /BitsPerComponent 8",
            &hex,
        ),
        &[],
    );
    let bytes = pdf::convert(&source).unwrap();
    let decoded = curves::decode(&bytes).unwrap();
    assert_eq!(u32_at(&decoded.images.table, 20), 4);
    let mut sections = container::decode_profile(&bytes, 3).unwrap();
    assert!(sections.iter().any(|s| s.tag == *b"VTEX" && s.required));
    sections.retain(|s| s.tag != *b"VTEX");
    assert!(curves::decode(&container::encode_profile(&sections, 3).unwrap()).is_err());
}
