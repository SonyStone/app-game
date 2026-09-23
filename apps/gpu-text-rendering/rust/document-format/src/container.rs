//! Little-endian GDOC container. All offsets are checked before slicing/allocation.

use std::collections::BTreeSet;

use crate::{error::DocumentError, limits::MAX_FILE_BYTES};
use miniz_oxide::{deflate::compress_to_vec_zlib, inflate::decompress_to_vec_zlib_with_limit};

/// One decoded section. Unknown optional tags may be ignored by a profile reader.
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct Section {
    /// Four ASCII bytes identifying the section's schema.
    pub tag: [u8; 4],
    /// A reader must understand this section before rendering the document.
    pub required: bool,
    /// Uncompressed bytes; file compression is independent of the profile.
    pub data: Vec<u8>,
}

/// Reads every section after validating the entire directory and size budgets.
///
/// # Errors
/// Rejects unsupported versions/codecs, corruption, overlaps, duplicate tags and
/// files reaching 2 GiB on disk or across decoded sections.
pub fn decode(bytes: &[u8]) -> Result<Vec<Section>, DocumentError> {
    decode_profile(bytes, 1)
}

/// Reads a known profile, preserving all container validation and allocation limits.
pub fn decode_profile(bytes: &[u8], profile: u32) -> Result<Vec<Section>, DocumentError> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err(DocumentError::Limit("file size"));
    }
    if bytes.len() < HEADER || bytes[..8] != MAGIC {
        return Err(DocumentError::Invalid("header or magic"));
    }
    if u16_at(bytes, 8) != 1 || u16_at(bytes, 10) != 0 || u32_at(bytes, 12) != profile {
        return Err(DocumentError::Unsupported("version or profile"));
    }
    let count = u32_at(bytes, 16) as usize;
    if count == 0 || count > MAX_SECTIONS {
        return Err(DocumentError::Limit("section count"));
    }
    let table_end = HEADER + count * ENTRY;
    if table_end > bytes.len()
        || u32_at(bytes, 24) as usize != bytes.len()
        || u32_at(bytes, 28) != 0
    {
        return Err(DocumentError::Invalid("file length or directory"));
    }
    if crc32fast::hash(&bytes[HEADER..table_end]) != u32_at(bytes, 20) {
        return Err(DocumentError::Checksum);
    }

    let mut tags = BTreeSet::new();
    let mut ranges = Vec::with_capacity(count);
    let mut decoded_total = 0usize;
    for entry in bytes[HEADER..table_end].chunks_exact(ENTRY) {
        let tag = [entry[0], entry[1], entry[2], entry[3]];
        let offset = u32_at(entry, 8) as usize;
        let stored = u32_at(entry, 12) as usize;
        let decoded = u32_at(entry, 16) as usize;
        if !tags.insert(tag)
            || !tag.iter().all(u8::is_ascii_uppercase)
            || u16_at(entry, 6) > 1
            || entry[24..32].iter().any(|v| *v != 0)
            || offset < table_end
            || !offset.is_multiple_of(8)
            || offset > bytes.len()
            || stored > bytes.len() - offset
        {
            return Err(DocumentError::Invalid("section directory entry"));
        }
        if u16_at(entry, 4) > 1 {
            return Err(DocumentError::Unsupported("compression codec"));
        }
        if decoded > MAX_DECODED_BYTES - decoded_total {
            return Err(DocumentError::Limit("decoded size"));
        }
        decoded_total += decoded;
        ranges.push((offset, offset + stored));
    }
    ranges.sort_unstable();
    if ranges.windows(2).any(|pair| pair[0].1 > pair[1].0) {
        return Err(DocumentError::Invalid("overlapping sections"));
    }

    bytes[HEADER..table_end]
        .chunks_exact(ENTRY)
        .map(|entry| {
            let offset = u32_at(entry, 8) as usize;
            let stored = u32_at(entry, 12) as usize;
            let decoded = u32_at(entry, 16) as usize;
            let source = &bytes[offset..offset + stored];
            let data = if u16_at(entry, 4) == 0 {
                if stored != decoded {
                    return Err(DocumentError::Invalid("raw section length"));
                }
                source.to_vec()
            } else {
                decompress_to_vec_zlib_with_limit(source, decoded)
                    .map_err(|_| DocumentError::Compression)?
            };
            if data.len() != decoded {
                return Err(DocumentError::Compression);
            }
            if crc32fast::hash(&data) != u32_at(entry, 20) {
                return Err(DocumentError::Checksum);
            }
            Ok(Section {
                tag: [entry[0], entry[1], entry[2], entry[3]],
                required: u16_at(entry, 6) == 1,
                data,
            })
        })
        .collect()
}

/// Writes deterministic sections, choosing zlib only when it reduces their size.
///
/// # Errors
/// Rejects section counts/sizes and duplicate/invalid tags. The caller must
/// validate profile contents separately. Does not write to disk or own GPU resources.
pub fn encode(sections: &[Section]) -> Result<Vec<u8>, DocumentError> {
    encode_profile(sections, 1)
}

/// Writes sections for a known profile; profile contents remain the caller's responsibility.
pub fn encode_profile(sections: &[Section], profile: u32) -> Result<Vec<u8>, DocumentError> {
    encode_profile_owned(sections.to_vec(), profile)
}

/// Reuses a profile-3 image payload allocation as the output buffer to avoid a second large block.
pub fn encode_profile_owned(
    mut sections: Vec<Section>,
    profile: u32,
) -> Result<Vec<u8>, DocumentError> {
    if !matches!(profile, 1..=3) {
        return Err(DocumentError::Unsupported("profile"));
    }
    if sections.is_empty() || sections.len() > MAX_SECTIONS {
        return Err(DocumentError::Limit("section count"));
    }
    let mut total = 0usize;
    let mut tags = BTreeSet::new();
    for section in &sections {
        if !tags.insert(section.tag) || !section.tag.iter().all(u8::is_ascii_uppercase) {
            return Err(DocumentError::Invalid("section tag"));
        }
        if section.data.len() > MAX_DECODED_BYTES - total {
            return Err(DocumentError::Limit("decoded size"));
        }
        total += section.data.len();
    }
    let table_end = HEADER + sections.len() * ENTRY;
    // Reserve the complete upper bound once. Appending a tiny extension after a
    // large PIXL section must not double an almost-gigabyte output allocation.
    let capacity = total
        .checked_add(table_end + sections.len() * 7)
        .ok_or(DocumentError::Limit("file size"))?;
    let pixel_index = (profile == 3)
        .then(|| sections.iter().position(|s| s.tag == *b"PIXL"))
        .flatten();
    let mut bytes =
        pixel_index.map_or_else(Vec::new, |index| std::mem::take(&mut sections[index].data));
    let pixel_length = bytes.len();
    bytes
        .try_reserve_exact(capacity.saturating_sub(bytes.len()))
        .map_err(|_| DocumentError::Limit("encoded document memory"))?;
    bytes.resize(pixel_length + table_end, 0);
    bytes.copy_within(0..pixel_length, table_end);
    bytes[..table_end].fill(0);
    bytes[..8].copy_from_slice(&MAGIC);
    bytes[8..10].copy_from_slice(&1u16.to_le_bytes());
    put_u32(&mut bytes, 12, profile);
    put_u32(&mut bytes, 16, sections.len() as u32);

    for (index, section) in sections.iter().enumerate() {
        if pixel_index == Some(index) {
            let entry = HEADER + index * ENTRY;
            bytes[entry..entry + 4].copy_from_slice(&section.tag);
            bytes[entry + 6..entry + 8].copy_from_slice(&u16::from(section.required).to_le_bytes());
            put_u32(&mut bytes, entry + 8, table_end as u32);
            put_u32(&mut bytes, entry + 12, pixel_length as u32);
            put_u32(&mut bytes, entry + 16, pixel_length as u32);
            let checksum = crc32fast::hash(&bytes[table_end..table_end + pixel_length]);
            put_u32(&mut bytes, entry + 20, checksum);
            continue;
        }
        bytes.resize(bytes.len().next_multiple_of(8), 0);
        // Image payloads already carry JPEG/zlib/tile compression. Recompressing a
        // gigabyte of them adds a full-size allocation with little storage benefit.
        let compressed = if section.tag == *b"PIXL" && profile == 3 {
            Vec::new()
        } else {
            compress_to_vec_zlib(&section.data, 6)
        };
        let use_compression = !compressed.is_empty() && compressed.len() < section.data.len();
        let stored = if use_compression {
            &compressed
        } else {
            &section.data
        };
        let start = bytes.len();
        if stored.len() > MAX_FILE_BYTES.saturating_sub(start) {
            return Err(DocumentError::Limit("file size"));
        }
        let entry = HEADER + index * ENTRY;
        bytes[entry..entry + 4].copy_from_slice(&section.tag);
        bytes[entry + 4..entry + 6].copy_from_slice(&u16::from(use_compression).to_le_bytes());
        bytes[entry + 6..entry + 8].copy_from_slice(&u16::from(section.required).to_le_bytes());
        put_u32(&mut bytes, entry + 8, start as u32);
        put_u32(&mut bytes, entry + 12, stored.len() as u32);
        put_u32(&mut bytes, entry + 16, section.data.len() as u32);
        put_u32(&mut bytes, entry + 20, crc32fast::hash(&section.data));
        bytes.extend_from_slice(stored);
    }
    let checksum = crc32fast::hash(&bytes[HEADER..table_end]);
    let length = bytes.len() as u32;
    put_u32(&mut bytes, 20, checksum);
    put_u32(&mut bytes, 24, length);
    Ok(bytes)
}

// Only called after validating the enclosing fixed-size record.
pub(crate) fn u16_at(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

pub(crate) fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

pub(crate) fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

const MAGIC: [u8; 8] = *b"GDOC\r\n\x1a\n";
const HEADER: usize = 32;
const ENTRY: usize = 32;
const MAX_SECTIONS: usize = 64;
pub(crate) const MAX_DECODED_BYTES: usize = 2 * 1024 * 1024 * 1024 - 1;

#[cfg(test)]
mod owned_writer_tests {
    use super::*;

    #[test]
    fn reuses_the_pixel_allocation_even_with_trailing_sections() {
        let mut pixels = Vec::with_capacity(8192);
        pixels.extend(0..=255);
        let allocation = pixels.as_ptr();
        let bytes = encode_profile_owned(
            vec![
                Section {
                    tag: *b"PIXL",
                    required: true,
                    data: pixels,
                },
                Section {
                    tag: *b"IPCK",
                    required: true,
                    data: vec![1, 0, 0, 0],
                },
            ],
            3,
        )
        .unwrap();
        assert_eq!(bytes.as_ptr(), allocation);
    }

    #[test]
    fn preserves_section_data_when_image_payload_is_physically_first() {
        let sections = vec![
            Section {
                tag: *b"PAGE",
                required: true,
                data: vec![7; 128],
            },
            Section {
                tag: *b"PIXL",
                required: true,
                data: (0..=255).collect(),
            },
            Section {
                tag: *b"IPCK",
                required: true,
                data: vec![1, 0, 0, 0],
            },
        ];
        let bytes = encode_profile_owned(sections.clone(), 3).unwrap();
        assert_eq!(decode_profile(&bytes, 3).unwrap(), sections);
    }
}
