//! Lossless tiled image payloads and hostile addressing.
use gpu_document::{raster::Images, raster_tiles};

#[test]
fn preserves_internal_neighbors_odd_edges_and_terminal_mips() {
    let (w, h) = (257, 3);
    let mut pixels = Vec::new();
    for y in 0..h {
        for x in 0..w {
            pixels.extend_from_slice(&[x as u8, y as u8, 0, 255]);
        }
    }
    let packed = raster_tiles::encode(w, h, &pixels).unwrap();
    raster_tiles::validate(w, h, &packed).unwrap();
    let left = tile(&packed, 0);
    let right = tile(&packed, 1);
    assert_eq!(
        &left[(130 + 128) * 4..(130 + 130) * 4],
        &right[130 * 4..132 * 4]
    );
    let last = tile(&packed, u32_at(&packed, 8) as usize - 1);
    assert_eq!(last.len(), 3 * 3 * 4);
    assert!(last.chunks_exact(4).all(|p| p == &last[..4]));
}

#[test]
fn rejects_truncated_headers_ranges_expansion_and_nonpremultiplied_pixels() {
    let packed = raster_tiles::encode(2, 2, &[255; 16]).unwrap();
    for offset in [0, 4, 8, 12, 16, 20] {
        let mut bad = packed.clone();
        bad[offset..offset + 4].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(
            raster_tiles::validate(2, 2, &bad).is_err(),
            "offset {offset}"
        );
    }
    for length in 0..32 {
        assert!(raster_tiles::validate(2, 2, &packed[..length]).is_err());
    }
    assert!(raster_tiles::encode(1, 1, &[255, 0, 0, 0]).is_err());
    let mut extra = packed.clone();
    extra.push(0);
    assert!(raster_tiles::validate(2, 2, &extra).is_err());
    assert!(raster_tiles::validate(1, 2, &packed).is_err());
}

#[test]
fn validates_tiled_images_through_the_shared_resource_table() {
    let payload = raster_tiles::encode(129, 129, &vec![127; 129 * 129 * 4]).unwrap();
    let images = Images {
        table: [129, 129, 0, payload.len() as u32, 1, 4]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect(),
        pixels: payload,
    };
    assert!(images.validate().is_ok());
}

fn tile(bytes: &[u8], index: usize) -> Vec<u8> {
    let offset = u32_at(bytes, 16 + index * 8) as usize;
    let length = u32_at(bytes, 20 + index * 8) as usize;
    miniz_oxide::inflate::decompress_to_vec_zlib(&bytes[offset..offset + length]).unwrap()
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}
