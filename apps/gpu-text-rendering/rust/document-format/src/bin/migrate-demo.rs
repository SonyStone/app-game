//! One-time importer for the original demo's binary-in-BMP assets, not an image/PDF parser.

use gpu_document::{
    container::{self, Section},
    quadratic,
};
use serde::Deserialize;
use std::{env, fs, path::Path};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        return Err("Usage: migrate-demo <legacy-asset-directory> <output.gdoc>".into());
    }
    let source = Path::new(&args[1]);
    let pages: Vec<LegacyPage> = serde_json::from_slice(&fs::read(source.join("pages.json"))?)?;
    let mut page_bytes = Vec::with_capacity(pages.len() * 24);
    for page in pages {
        if !page.images.is_empty()
            || page.begin_vertex % 6 != 0
            || page.end_vertex % 6 != 0
            || page.end_vertex < page.begin_vertex
        {
            return Err(
                "Initial glyph profile cannot represent images or partial glyph ranges".into(),
            );
        }
        page_bytes.extend_from_slice(&page.width.to_le_bytes());
        page_bytes.extend_from_slice(&page.height.to_le_bytes());
        page_bytes.extend_from_slice(&(page.begin_vertex / 6).to_le_bytes());
        page_bytes.extend_from_slice(&((page.end_vertex - page.begin_vertex) / 6).to_le_bytes());
    }
    let mut glyphs = read_bmp(source, "glyphs.bmp")?.2;
    if glyphs.len() % 20 != 0 {
        return Err("Incomplete legacy glyph record".into());
    }
    let mut position = [0i16; 2];
    for record in glyphs.chunks_exact_mut(20) {
        for (axis, previous) in position.iter_mut().enumerate() {
            let offset = axis * 2;
            *previous =
                previous.wrapping_add(i16::from_le_bytes([record[offset], record[offset + 1]]));
            record[offset..offset + 2].copy_from_slice(&previous.to_le_bytes());
        }
    }
    if !read_bmp(source, "imageverts.bmp")?.2.is_empty() {
        return Err("Initial glyph profile cannot represent image vertices".into());
    }
    let sections = vec![
        Section {
            tag: *b"PAGE",
            required: true,
            data: page_bytes,
        },
        Section {
            tag: *b"GLYP",
            required: true,
            data: glyphs,
        },
        sized_section(source, "atlas.bmp", *b"ATLS")?,
        sized_section(source, "atlasverts.bmp", *b"PRER")?,
    ];
    let bytes = container::encode(&sections)?;
    let decoded = quadratic::decode(&bytes)?;
    fs::write(&args[2], &bytes)?;
    println!(
        "{} pages, {} glyphs, {} bytes → {}",
        decoded.pages.len(),
        decoded.positions_x.len(),
        bytes.len(),
        args[2]
    );
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyPage {
    width: f64,
    height: f64,
    begin_vertex: u32,
    end_vertex: u32,
    images: Vec<serde_json::Value>,
}

fn sized_section(
    source: &Path,
    name: &str,
    tag: [u8; 4],
) -> Result<Section, Box<dyn std::error::Error>> {
    let (width, height, data) = read_bmp(source, name)?;
    let mut bytes = Vec::with_capacity(8 + data.len());
    bytes.extend_from_slice(&width.to_le_bytes());
    bytes.extend_from_slice(&height.to_le_bytes());
    bytes.extend_from_slice(&data);
    Ok(Section {
        tag,
        required: true,
        data: bytes,
    })
}

// These particular legacy containers always have a 54-byte header, even when not real BMP images.
fn read_bmp(source: &Path, name: &str) -> Result<(u32, u32, Vec<u8>), Box<dyn std::error::Error>> {
    let bytes = fs::read(source.join(name))?;
    if bytes.len() < 54 || &bytes[..2] != b"BM" {
        return Err("Invalid legacy BMP container".into());
    }
    let width = u16::from_le_bytes([bytes[18], bytes[19]]) as u32;
    let height = u16::from_le_bytes([bytes[22], bytes[23]]) as u32;
    Ok((width, height, bytes[54..].to_vec()))
}
