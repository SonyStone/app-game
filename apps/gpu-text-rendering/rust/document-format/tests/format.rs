//! Public-interface tests for untrusted files and native/GPU data fidelity.
use gpu_document::{
    container::{self, Section},
    error::DocumentError,
    quadratic,
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

fn repair_crc(bytes: &mut [u8]) {
    let count = u32::from_le_bytes(bytes[16..20].try_into().unwrap()) as usize;
    let crc = crc32fast::hash(&bytes[32..32 + count * 32]);
    bytes[20..24].copy_from_slice(&crc.to_le_bytes());
}
