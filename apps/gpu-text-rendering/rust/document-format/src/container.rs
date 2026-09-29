//! Little-endian GDOC container. All offsets are checked before slicing/allocation.

use std::collections::BTreeSet;

use crate::{
    error::DocumentError,
    limits::{MAX_FILE_BYTES, MAX_WORKING_BYTES},
};
use miniz_oxide::deflate::compress_to_vec_zlib;

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
///
/// The borrowed input stays resident, so it counts toward the 3 GiB working budget
/// together with every decoded section (`Limit("decoded document memory")`).
pub fn decode_profile(bytes: &[u8], profile: u32) -> Result<Vec<Section>, DocumentError> {
    let entries = directory(bytes, profile)?;
    working_budget(bytes.len(), &entries, None)?;
    entries.iter().map(|entry| entry.read(bytes)).collect()
}

/// Consumes the file and moves its largest raw section into the input allocation in
/// place, so a large uncompressed `PIXL` is never held twice. Other sections are copied or
/// inflated first. Validation, checksums and errors match [`decode_profile`]; the reused
/// section is excluded from the working budget.
pub fn decode_profile_owned(
    mut bytes: Vec<u8>,
    profile: u32,
) -> Result<Vec<Section>, DocumentError> {
    let entries = directory(&bytes, profile)?;
    let reused = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.codec == 0)
        .max_by_key(|(_, entry)| entry.stored)
        .map(|(index, _)| index);
    working_budget(bytes.len(), &entries, reused)?;
    let mut sections = Vec::with_capacity(entries.len());
    for (index, entry) in entries.iter().enumerate() {
        if Some(index) != reused {
            sections.push(Some(entry.read(&bytes)?));
        } else {
            // Checked in directory order, so errors match `decode_profile` exactly.
            entry.check(&bytes[entry.offset..entry.offset + entry.stored])?;
            sections.push(None);
        }
    }
    if let Some(index) = reused {
        let entry = &entries[index];
        bytes.copy_within(entry.offset..entry.offset + entry.stored, 0);
        bytes.truncate(entry.stored);
        sections[index] = Some(Section {
            tag: entry.tag,
            required: entry.required,
            data: bytes,
        });
    }
    Ok(sections.into_iter().flatten().collect())
}

/// One validated directory entry; offsets are already checked against the file.
struct Entry {
    tag: [u8; 4],
    codec: u16,
    required: bool,
    offset: usize,
    stored: usize,
    decoded: usize,
    checksum: u32,
}

impl Entry {
    /// Copies or inflates this section into an exactly sized, fallibly reserved buffer.
    fn read(&self, bytes: &[u8]) -> Result<Section, DocumentError> {
        let source = &bytes[self.offset..self.offset + self.stored];
        let mut data = Vec::new();
        data.try_reserve_exact(self.decoded)
            .map_err(|_| DocumentError::Limit("decoded document memory"))?;
        if self.codec == 0 {
            data.extend_from_slice(source);
        } else {
            // Inflate into the declared size; there is no geometric growth, and output
            // longer or shorter than declared is a compression error.
            data.resize(self.decoded, 0);
            let written = miniz_oxide::inflate::decompress_slice_iter_to_slice(
                &mut data,
                std::iter::once(source),
                true,
                false,
            )
            .map_err(|_| DocumentError::Compression)?;
            if written != self.decoded {
                return Err(DocumentError::Compression);
            }
        }
        self.check(&data)?;
        Ok(Section {
            tag: self.tag,
            required: self.required,
            data,
        })
    }

    fn check(&self, data: &[u8]) -> Result<(), DocumentError> {
        if data.len() != self.decoded {
            return Err(DocumentError::Compression);
        }
        if crc32fast::hash(data) != self.checksum {
            return Err(DocumentError::Checksum);
        }
        Ok(())
    }
}

/// Validates the header, directory and per-file budgets before any section is decoded.
fn directory(bytes: &[u8], profile: u32) -> Result<Vec<Entry>, DocumentError> {
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
    let mut entries = Vec::with_capacity(count);
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
        let codec = u16_at(entry, 4);
        if codec > 1 {
            return Err(DocumentError::Unsupported("compression codec"));
        }
        if decoded > MAX_DECODED_BYTES - decoded_total {
            return Err(DocumentError::Limit("decoded size"));
        }
        if codec == 0 && stored != decoded {
            return Err(DocumentError::Invalid("raw section length"));
        }
        decoded_total += decoded;
        entries.push(Entry {
            tag,
            codec,
            required: u16_at(entry, 6) == 1,
            offset,
            stored,
            decoded,
            checksum: u32_at(entry, 20),
        });
    }
    let mut ranges: Vec<_> = entries
        .iter()
        .map(|e| (e.offset, e.offset + e.stored))
        .collect();
    ranges.sort_unstable();
    if ranges.windows(2).any(|pair| pair[0].1 > pair[1].0) {
        return Err(DocumentError::Invalid("overlapping sections"));
    }
    Ok(entries)
}

/// Input bytes plus every newly allocated section must fit [`MAX_WORKING_BYTES`], so the
/// documented file and section limits cannot combine into a WASM out-of-memory trap.
fn working_budget(
    input: usize,
    entries: &[Entry],
    reused: Option<usize>,
) -> Result<(), DocumentError> {
    let decoded: usize = entries
        .iter()
        .enumerate()
        .filter(|(index, _)| Some(*index) != reused)
        .map(|(_, entry)| entry.decoded)
        .sum();
    if decoded > MAX_WORKING_BYTES.saturating_sub(input) {
        return Err(DocumentError::Limit("decoded document memory"));
    }
    Ok(())
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
    // The moved PIXL payload bypasses the per-section file-size check below.
    if pixel_length > MAX_FILE_BYTES - table_end {
        return Err(DocumentError::Limit("file size"));
    }
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

    #[test]
    fn owned_decoding_moves_the_largest_raw_section_into_the_input_allocation() {
        let sections = vec![
            Section {
                tag: *b"PAGE",
                required: true,
                data: vec![7; 4096],
            },
            Section {
                tag: *b"PIXL",
                required: true,
                data: (0..=255).cycle().take(8192).collect(),
            },
            Section {
                tag: *b"IPCK",
                required: true,
                data: vec![1, 0, 0, 0],
            },
        ];
        let bytes = encode_profile_owned(sections.clone(), 3).unwrap();
        let allocation = bytes.as_ptr();
        let decoded = decode_profile_owned(bytes.clone(), 3).unwrap();
        assert_eq!(decoded, sections);
        let decoded = decode_profile_owned(bytes, 3).unwrap();
        assert_eq!(decoded[1].data.as_ptr(), allocation);

        // Corrupted reused payloads still fail their checksum.
        let mut corrupt = encode_profile_owned(sections, 3).unwrap();
        let pixel_offset = u32_at(&corrupt, HEADER + ENTRY + 8) as usize;
        corrupt[pixel_offset] ^= 1;
        assert_eq!(
            decode_profile_owned(corrupt, 3),
            Err(DocumentError::Checksum)
        );

        // With several bad sections both readers report the first in directory order
        // (found by the `container` differential fuzz target).
        let sections = vec![
            Section {
                tag: *b"PIXL",
                required: true,
                data: (0..=255).collect(),
            },
            Section {
                tag: *b"PAGE",
                required: true,
                data: vec![7; 4096],
            },
        ];
        let mut both = encode_profile_owned(sections, 3).unwrap();
        let pixel_offset = u32_at(&both, HEADER + 8) as usize;
        let page_offset = u32_at(&both, HEADER + ENTRY + 8) as usize;
        assert_eq!(u16_at(&both, HEADER + ENTRY + 4), 1);
        both[pixel_offset] ^= 1;
        both[page_offset + 2] ^= 0xff;
        assert_eq!(decode_profile(&both, 3), Err(DocumentError::Checksum));
        assert_eq!(decode_profile_owned(both, 3), Err(DocumentError::Checksum));
    }

    #[test]
    fn input_and_decoded_sections_share_the_working_budget() {
        let entry = |decoded: usize, codec: u16| Entry {
            tag: *b"TEST",
            codec,
            required: false,
            offset: 0,
            stored: 0,
            decoded,
            checksum: 0,
        };
        let entries = [entry(1024 * 1024 * 1024, 1), entry(1536 * 1024 * 1024, 0)];
        let input = 1600 * 1024 * 1024;
        assert_eq!(
            working_budget(input, &entries, None),
            Err(DocumentError::Limit("decoded document memory"))
        );
        // Reusing the raw section's input bytes leaves room for the rest.
        assert!(working_budget(input, &entries, Some(1)).is_ok());
    }

    #[test]
    fn inflates_exactly_the_declared_length() {
        let data = vec![9u8; 10_000];
        let packed = compress_to_vec_zlib(&data, 6);
        let entry = |decoded| Entry {
            tag: *b"TEST",
            codec: 1,
            required: false,
            offset: 0,
            stored: packed.len(),
            decoded,
            checksum: crc32fast::hash(&data),
        };
        assert_eq!(entry(10_000).read(&packed).unwrap().data, data);
        assert_eq!(entry(9_999).read(&packed), Err(DocumentError::Compression));
        assert_eq!(entry(10_001).read(&packed), Err(DocumentError::Compression));
    }
}
