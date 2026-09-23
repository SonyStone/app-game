//! Synthetic, non-inverted PDF component samples encoded as CMYK and YCCK JPEG.
use gpu_document::raster_jpeg;

#[test]
fn respects_pdf_polarity_for_cmyk_and_ycck_without_inverting_rgb() {
    for bytes in [
        include_bytes!("../../../tests/fixtures/jpeg/pdf-cmyk.jpg").as_slice(),
        include_bytes!("../../../tests/fixtures/jpeg/pdf-ycck.jpg").as_slice(),
    ] {
        let rgba = raster_jpeg::decode(bytes, 64, 16).unwrap();
        let sample = |x: usize| &rgba[(8 * 64 + x) * 4..(8 * 64 + x) * 4 + 4];
        assert!(
            sample(8)[..3].iter().all(|c| *c > 240),
            "white: {:?}",
            sample(8)
        );
        assert!(
            sample(24)[..3].iter().all(|c| *c < 60),
            "black: {:?}",
            sample(24)
        );
        assert!(
            sample(40)[0] < 70 && sample(40)[1] > 100 && sample(40)[2] > 100,
            "cyan: {:?}",
            sample(40)
        );
        assert!(
            sample(56)[0] > 150 && sample(56)[1] < 100 && sample(56)[2] > 80,
            "magenta: {:?}",
            sample(56)
        );
        assert!(rgba.chunks_exact(4).all(|p| p[3] == 255));
    }
}

#[test]
fn rejects_bad_headers_dimensions_and_incomplete_icc_segments() {
    let jpeg = include_bytes!("../../../tests/fixtures/jpeg/pdf-ycck.jpg");
    assert!(raster_jpeg::decode(jpeg, 1, 1).is_err());
    assert!(raster_jpeg::decode(&jpeg[..100], 64, 16).is_err());
    let mut incomplete = jpeg[..2].to_vec();
    incomplete.extend_from_slice(&[255, 226, 0, 17]);
    incomplete.extend_from_slice(b"ICC_PROFILE\0");
    incomplete.extend_from_slice(&[1, 2, 0]);
    incomplete.extend_from_slice(&jpeg[2..]);
    assert!(raster_jpeg::decode(&incomplete, 64, 16).is_err());
}
