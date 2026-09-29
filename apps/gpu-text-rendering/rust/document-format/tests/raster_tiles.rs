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
fn every_tile_matches_clamped_sampling_of_its_box_filtered_level() {
    for (w, h) in [(1, 1), (2, 3), (128, 128), (129, 130), (300, 257), (517, 5)] {
        let mut seed: u32 = w * 7919 + h;
        let pixels: Vec<u8> = (0..w * h)
            .flat_map(|_| {
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                let a = (seed >> 24) as u8;
                [(seed >> 4) as u8, (seed >> 8) as u8, (seed >> 16) as u8, a].map(|c| c.min(a))
            })
            .collect();
        let packed = raster_tiles::encode(w, h, &pixels).unwrap();
        let (mut level, mut lw, mut lh, mut index) = (pixels, w, h, 0);
        loop {
            for ty in 0..lh.div_ceil(128) {
                for tx in 0..lw.div_ceil(128) {
                    let (tw, th) = ((lw - tx * 128).min(128) + 2, (lh - ty * 128).min(128) + 2);
                    let expected: Vec<u8> = (0..th)
                        .flat_map(|y| (0..tw).map(move |x| (x, y)))
                        .flat_map(|(x, y)| {
                            let sx = (tx * 128 + x).saturating_sub(1).min(lw - 1);
                            let sy = (ty * 128 + y).saturating_sub(1).min(lh - 1);
                            let at = ((sy * lw + sx) * 4) as usize;
                            level[at..at + 4].to_vec()
                        })
                        .collect();
                    assert_eq!(tile(&packed, index), expected, "{w}x{h} tile {index}");
                    index += 1;
                }
            }
            if lw == 1 && lh == 1 {
                break;
            }
            let (nw, nh) = ((lw / 2).max(1), (lh / 2).max(1));
            level = (0..nw * nh * 4)
                .map(|i| {
                    let (x, y, c) = (i / 4 % nw, i / 4 / nw, i % 4);
                    let (xs, ys) = (x * lw / nw..(x + 1) * lw / nw, y * lh / nh..(y + 1) * lh / nh);
                    let count = xs.len() as u32 * ys.len() as u32;
                    let sum: u32 = ys
                        .flat_map(|sy| xs.clone().map(move |sx| (sx, sy)))
                        .map(|(sx, sy)| u32::from(level[((sy * lw + sx) * 4 + c) as usize]))
                        .sum();
                    ((sum + count / 2) / count) as u8
                })
                .collect();
            (lw, lh) = (nw, nh);
        }
        assert_eq!(index, u32_at(&packed, 8) as usize);
    }
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
