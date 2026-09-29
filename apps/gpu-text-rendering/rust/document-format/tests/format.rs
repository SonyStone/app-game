//! Public-interface tests for untrusted files and native/GPU data fidelity.
use gpu_document::{
    container::{self, Section},
    curves::{self, Document, Page},
    error::DocumentError,
    quadratic,
    raster::Images,
};

#[test]
fn profile_expands_quads_with_original_corner_flags_and_wrapping() {
    let document = quadratic::decode(&container::encode(&fixture()).unwrap()).unwrap();
    let words = document
        .vertices
        .chunks_exact(2)
        .map(|p| i16::from_le_bytes([p[0], p[1]]))
        .collect::<Vec<_>>();
    assert_eq!(words.len(), 36);
    assert_eq!(&words[..6], &[32760, 200, 0, 0, -1, -1]);
    assert_eq!(&words[6..12], &[-32756, 200, 1, 0, -1, -1]);
    assert_eq!(&words[12..18], &[32760, 230, 0, 1, -1, -1]);
    assert_eq!(
        document.positions_x,
        vec![((32760.0 + 10.0) / 32767.0 + 0.5) as f32]
    );
}

#[test]
fn roundtrip_preserves_raw_and_compressed_sections_deterministically() {
    let sections = vec![
        Section {
            tag: *b"TEST",
            required: false,
            data: vec![7; 4096],
        },
        Section {
            tag: *b"NOTE",
            required: false,
            data: vec![1, 2, 3],
        },
    ];
    let encoded = container::encode(&sections).unwrap();
    assert_eq!(container::decode(&encoded).unwrap(), sections);
    assert_eq!(encoded, container::encode(&sections).unwrap());
    assert!(encoded.len() < 256);
}

#[test]
fn optional_sections_are_skipped_but_required_ones_fail() {
    let mut sections = fixture();
    sections.push(Section {
        tag: *b"NOTE",
        required: false,
        data: vec![1, 2, 3],
    });
    assert!(quadratic::decode(&container::encode(&sections).unwrap()).is_ok());
    sections.last_mut().unwrap().required = true;
    assert_eq!(
        quadratic::decode(&container::encode(&sections).unwrap()).unwrap_err(),
        DocumentError::Unsupported("required section")
    );
}

#[test]
fn every_truncated_prefix_fails_and_every_single_byte_mutation_is_panic_free() {
    let bytes = container::encode(&fixture()).unwrap();
    for offset in 0..bytes.len() {
        assert!(
            quadratic::decode(&bytes[..offset]).is_err(),
            "prefix {offset}"
        );
        let mut mutated = bytes.clone();
        mutated[offset] ^= 0xff;
        let _result = quadratic::decode(&mutated);
    }
}

#[test]
fn curve_profiles_survive_truncation_and_every_byte_mutation() {
    for profile in [2, 3] {
        let bytes = curves::encode(&scene(profile == 3)).unwrap();
        assert_eq!(
            u32::from_le_bytes(bytes[12..16].try_into().unwrap()),
            profile
        );
        assert!(curves::decode_owned(bytes.clone()).is_ok());
        for offset in 0..bytes.len() {
            assert!(
                curves::decode(&bytes[..offset]).is_err(),
                "profile {profile} prefix {offset}"
            );
            let mut mutated = bytes.clone();
            mutated[offset] ^= 0xff;
            let _result = curves::decode(&mutated);
            let _result = curves::decode_owned(mutated);
        }
    }
}

#[test]
fn curve_profile_sections_reject_or_accept_every_mutation_without_panicking() {
    // Container checksums hide most file-level mutations, so also mutate each decoded
    // section and re-encode it with valid CRCs to reach the profile validators.
    for profile in [2, 3] {
        let bytes = curves::encode(&scene(profile == 3)).unwrap();
        let sections = container::decode_profile(&bytes, profile).unwrap();
        for (index, section) in sections.iter().enumerate() {
            for offset in 0..section.data.len() {
                for flip in [0x01, 0x80, 0xff] {
                    let mut changed = sections.clone();
                    changed[index].data[offset] ^= flip;
                    let encoded = container::encode_profile(&changed, profile).unwrap();
                    let _result = curves::decode(&encoded);
                }
            }
            let mut truncated = sections.clone();
            truncated[index].data.pop();
            let encoded = container::encode_profile(&truncated, profile).unwrap();
            let _result = curves::decode(&encoded);
        }
    }
}

#[test]
fn versions_profile_and_unknown_codec_are_rejected() {
    let bytes = container::encode(&fixture()).unwrap();
    for offset in [8, 10, 12] {
        let mut changed = bytes.clone();
        changed[offset] = 2;
        assert!(matches!(
            quadratic::decode(&changed),
            Err(DocumentError::Unsupported(_))
        ));
    }
    let mut changed = bytes;
    changed[36] = 2;
    repair_crc(&mut changed);
    assert_eq!(
        container::decode(&changed),
        Err(DocumentError::Unsupported("compression codec"))
    );
}

#[test]
fn directory_corruption_offsets_overlaps_duplicates_and_reserved_fields_fail() {
    let bytes = container::encode(&fixture()).unwrap();
    let mut changed = bytes.clone();
    changed[40] ^= 8;
    assert_eq!(container::decode(&changed), Err(DocumentError::Checksum));
    for offset in [0, 33, u32::MAX] {
        let mut changed = bytes.clone();
        changed[40..44].copy_from_slice(&offset.to_le_bytes());
        repair_crc(&mut changed);
        assert!(matches!(
            container::decode(&changed),
            Err(DocumentError::Invalid(_))
        ));
    }
    let mut overlap = bytes.clone();
    overlap[72..76].copy_from_slice(&bytes[40..44]);
    repair_crc(&mut overlap);
    assert!(matches!(
        container::decode(&overlap),
        Err(DocumentError::Invalid(_))
    ));
    let mut duplicate = bytes.clone();
    duplicate[64..68].copy_from_slice(&bytes[32..36]);
    repair_crc(&mut duplicate);
    assert!(matches!(
        container::decode(&duplicate),
        Err(DocumentError::Invalid(_))
    ));
    let mut reserved = bytes;
    reserved[56] = 1;
    repair_crc(&mut reserved);
    assert!(matches!(
        container::decode(&reserved),
        Err(DocumentError::Invalid(_))
    ));
}

#[test]
fn incorrect_crc_and_decompression_limits_are_enforced() {
    let sections = [Section {
        tag: *b"TEST",
        required: false,
        data: vec![42; 4096],
    }];
    let bytes = container::encode(&sections).unwrap();
    let mut checksum = bytes.clone();
    checksum[52] ^= 1;
    repair_crc(&mut checksum);
    assert_eq!(container::decode(&checksum), Err(DocumentError::Checksum));
    let mut small = bytes.clone();
    small[48..52].copy_from_slice(&4u32.to_le_bytes());
    repair_crc(&mut small);
    assert_eq!(container::decode(&small), Err(DocumentError::Compression));
    let mut large = bytes;
    large[48..52].copy_from_slice(&u32::MAX.to_le_bytes());
    repair_crc(&mut large);
    assert_eq!(
        container::decode(&large),
        Err(DocumentError::Limit("decoded size"))
    );
}

#[test]
fn missing_sections_nan_pages_invalid_ranges_and_atlas_references_fail() {
    let mut missing = fixture();
    missing.pop();
    assert!(quadratic::decode(&container::encode(&missing).unwrap()).is_err());
    for width in [f64::NAN, 0.0, -1.0, f64::INFINITY] {
        let mut sections = fixture();
        sections[0].data[..8].copy_from_slice(&width.to_le_bytes());
        assert!(quadratic::decode(&container::encode(&sections).unwrap()).is_err());
    }
    let mut range = fixture();
    range[0].data[20..24].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(quadratic::decode(&container::encode(&range).unwrap()).is_err());
    let mut reference = fixture();
    reference[1].data[4..6].copy_from_slice(&u16::MAX.to_le_bytes());
    assert!(quadratic::decode(&container::encode(&reference).unwrap()).is_err());
}

#[test]
fn a_page_without_glyphs_is_valid() {
    let mut sections = fixture();
    sections[0].data[20..24].copy_from_slice(&0u32.to_le_bytes());
    sections[1].data.clear();
    sections[3].data.truncate(8);
    let document = quadratic::decode(&container::encode(&sections).unwrap()).unwrap();
    assert_eq!(document.pages.len(), 1);
    assert!(document.vertices.is_empty());
}

fn fixture() -> Vec<Section> {
    let mut page = Vec::new();
    page.extend_from_slice(&612f64.to_le_bytes());
    page.extend_from_slice(&792f64.to_le_bytes());
    page.extend_from_slice(&0u32.to_le_bytes());
    page.extend_from_slice(&1u32.to_le_bytes());
    let glyph = [32760i16, 200, 0, 0, 20, 0, 0, 30, -1, -1]
        .into_iter()
        .flat_map(i16::to_le_bytes)
        .collect();
    let mut atlas = Vec::from(4u32.to_le_bytes());
    atlas.extend_from_slice(&1u32.to_le_bytes());
    atlas.extend_from_slice(&[0; 16]);
    let mut prerender = Vec::from(1u32.to_le_bytes());
    prerender.extend_from_slice(&1u32.to_le_bytes());
    prerender.extend_from_slice(&[0; 72]);
    vec![
        Section {
            tag: *b"PAGE",
            required: true,
            data: page,
        },
        Section {
            tag: *b"GLYP",
            required: true,
            data: glyph,
        },
        Section {
            tag: *b"ATLS",
            required: true,
            data: atlas,
        },
        Section {
            tag: *b"PRER",
            required: true,
            data: prerender,
        },
    ]
}

/// A small valid scene: a clipped square outline in a group, plus (profile 3) a raw
/// image and a tiled image drawn between vector draws.
fn scene(images: bool) -> Document {
    let mut curves = Vec::new();
    let corners = [(0.0f32, 0.0f32), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    for i in 0..4 {
        let (a, b) = (corners[i], corners[(i + 1) % 4]);
        for t in [0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0] {
            curves.extend_from_slice(&(a.0 + (b.0 - a.0) * t).to_le_bytes());
            curves.extend_from_slice(&(a.1 + (b.1 - a.1) * t).to_le_bytes());
        }
    }
    let draw = |first: u32, count: u32, kind: u32| {
        let mut record = Vec::new();
        for v in [0.5f32, 0.0, 0.0, 0.5, 0.25, 0.25] {
            record.extend_from_slice(&v.to_le_bytes());
        }
        record.extend_from_slice(&[0; 8]);
        for v in [1.0f32, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0] {
            record.extend_from_slice(&v.to_le_bytes());
        }
        for v in [first, count, kind, 0] {
            record.extend_from_slice(&v.to_le_bytes());
        }
        record
    };
    let mut instances = draw(0, 4, 0);
    let mut table = Vec::new();
    let mut pixels = Vec::new();
    if images {
        instances.extend(draw(0, 0, 2));
        instances.extend(draw(1, 0, 2));
        instances.extend(draw(0, 4, 1));
        let raw = [255, 0, 0, 255, 0, 128, 0, 128, 0, 0, 0, 0, 10, 20, 30, 40];
        let tiled = gpu_document::raster_tiles::encode(3, 3, &[64; 36]).unwrap();
        for (w, h, payload, codec) in [(2u32, 2u32, &raw[..], 0u32), (3, 3, &tiled[..], 4)] {
            for v in [w, h, pixels.len() as u32, payload.len() as u32, 1, codec] {
                table.extend_from_slice(&v.to_le_bytes());
            }
            pixels.extend_from_slice(payload);
        }
    }
    let count = (instances.len() / 80) as u32;
    let mut groups = Vec::new();
    for v in [0u32, count, 1.0f32.to_bits(), 0, 0, 0] {
        groups.extend_from_slice(&v.to_le_bytes());
    }
    Document {
        pages: vec![Page {
            width: 100.0,
            height: 100.0,
            first: 0,
            count,
        }],
        curves,
        instances,
        images: Images { table, pixels },
        clips: Vec::new(),
        bins: Vec::new(),
        blends: vec![0; count as usize],
        groups,
        mask_transfers: Vec::new(),
        radial_gradients: Vec::new(),
    }
}

fn repair_crc(bytes: &mut [u8]) {
    let count = u32::from_le_bytes(bytes[16..20].try_into().unwrap()) as usize;
    let crc = crc32fast::hash(&bytes[32..32 + count * 32]);
    bytes[20..24].copy_from_slice(&crc.to_le_bytes());
}
