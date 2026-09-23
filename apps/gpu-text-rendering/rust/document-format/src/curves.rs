//! GDOC profiles 2/3: reusable monotone cubic contours, raster resources and ordered draws.

use crate::{
    container::{self, Section, u32_at},
    error::DocumentError,
    raster::Images,
};

/// Validates a curve scene before buffers cross the WASM/GPU boundary.
pub fn decode(bytes: &[u8]) -> Result<Document, DocumentError> {
    let profile = if bytes.len() >= 16 {
        u32_at(bytes, 12)
    } else {
        2
    };
    if !matches!(profile, 2 | 3) {
        return Err(DocumentError::Unsupported("curve scene profile"));
    }
    decode_sections(container::decode_profile(bytes, profile)?, profile)
}

// Both file decoding and direct PDF import pass through the same validation.
fn decode_sections(mut sections: Vec<Section>, profile: u32) -> Result<Document, DocumentError> {
    if sections.iter().any(|s| {
        s.required
            && !matches!(
                &s.tag,
                b"PAGE"
                    | b"CURV"
                    | b"DRAW"
                    | b"CLIP"
                    | b"BINS"
                    | b"BLND"
                    | b"BLNX"
                    | b"GFLG"
                    | b"GRUP"
                    | b"IPCK"
                    | b"HAIR"
                    | b"MASK"
                    | b"MTRF"
                    | b"RGRD"
                    | b"VTEX"
            )
            && !(profile == 3 && matches!(&s.tag, b"IMAG" | b"PIXL"))
    }) {
        return Err(DocumentError::Unsupported("required curve section"));
    }
    for section in &sections {
        if matches!(
            &section.tag,
            b"IPCK" | b"HAIR" | b"MASK" | b"VTEX" | b"BLNX" | b"GFLG"
        ) && (!section.required || section.data != [1, 0, 0, 0])
        {
            return Err(DocumentError::Invalid("rendering extension version/flags"));
        }
        if matches!(&section.tag, b"GRUP" | b"MTRF" | b"RGRD") && !section.required {
            return Err(DocumentError::Invalid("group extension flags"));
        }
    }
    let images = if profile == 3 {
        Images {
            table: take(&mut sections, *b"IMAG")?,
            pixels: take(&mut sections, *b"PIXL")?,
        }
    } else {
        Images::default()
    };
    if images.table.chunks_exact(24).any(|r| u32_at(r, 20) != 0)
        && !sections
            .iter()
            .any(|s| s.tag == *b"IPCK" && s.required && s.data == [1, 0, 0, 0])
    {
        return Err(DocumentError::Invalid("image encoding extension"));
    }
    if images.table.chunks_exact(24).any(|r| u32_at(r, 20) == 4)
        && !sections.iter().any(|s| s.tag == *b"VTEX")
    {
        return Err(DocumentError::Invalid("missing tiled image extension"));
    }
    images.validate()?;
    let curves = take(&mut sections, *b"CURV")?;
    let instances = take(&mut sections, *b"DRAW")?;
    if curves.len() % 32 != 0 || instances.len() % 80 != 0 {
        return Err(DocumentError::Invalid("curve/instance stride"));
    }
    if curves.len() / 32 > 2_000_000 || instances.len() / 80 > 1_500_000 {
        return Err(DocumentError::Limit("curve scene records"));
    }
    if instances.chunks_exact(80).any(|r| u32_at(r, 72) >= 3)
        && !sections.iter().any(|s| s.tag == *b"HAIR")
    {
        return Err(DocumentError::Invalid("missing hairline extension"));
    }
    for curve in curves.chunks_exact(32) {
        for axis in [0, 4] {
            let values = [
                f32_at(curve, axis),
                f32_at(curve, axis + 8),
                f32_at(curve, axis + 16),
                f32_at(curve, axis + 24),
            ];
            if values
                .iter()
                .any(|v| !v.is_finite() || !(-4.0..=4.0).contains(v))
                || !(-0.00001..=1.00001).contains(&values[0])
                || !(-0.00001..=1.00001).contains(&values[3])
                || !monotone(values)
            {
                return Err(DocumentError::Invalid("non-monotone or unnormalized cubic"));
            }
        }
    }
    let clips = if sections.iter().any(|s| s.tag == *b"CLIP") {
        take(&mut sections, *b"CLIP")?
    } else {
        Vec::new()
    };
    if clips.len() % 80 != 0 || clips.len() / 80 > 1_000_000 {
        return Err(DocumentError::Invalid("clip records"));
    }
    let mut depths = Vec::new();
    for (index, clip) in clips.chunks_exact(80).enumerate() {
        let parent = u32_at(clip, 76) as usize;
        validate_instance(clip, curves.len() / 32, 0, parent, 0)?;
        if parent > index || u32_at(clip, 72) > 1 {
            return Err(DocumentError::Invalid("clip parent/cycle"));
        }
        let depth = if parent == 0 {
            1
        } else {
            depths[parent - 1] + 1
        };
        if depth > 32 {
            return Err(DocumentError::Limit("clip chain depth"));
        }
        depths.push(depth);
    }
    let bins = if sections.iter().any(|s| s.tag == *b"BINS") {
        take(&mut sections, *b"BINS")?
    } else {
        Vec::new()
    };
    crate::curve_bins::validate(&bins, &instances, &clips)?;
    let blends = if sections.iter().any(|s| s.tag == *b"BLND") {
        take(&mut sections, *b"BLND")?
    } else {
        vec![0; instances.len() / 80]
    };
    if blends.len() != instances.len() / 80 || blends.iter().any(|b| !matches!(*b, 0 | 1 | 4..=17))
    {
        return Err(DocumentError::Invalid("blend records"));
    }
    let page_data = take(&mut sections, *b"PAGE")?;
    let mut pages = Vec::new();
    let mut next = 0u32;
    if page_data.is_empty() || page_data.len() % 24 != 0 || page_data.len() / 24 > 10_000 {
        return Err(DocumentError::Invalid("curve page table"));
    }
    for record in page_data.chunks_exact(24) {
        let width = f64_at(record, 0);
        let height = f64_at(record, 8);
        let first = u32_at(record, 16);
        let count = u32_at(record, 20);
        if !(0.001..=1_000_000.0).contains(&width)
            || !(0.001..=1_000_000.0).contains(&height)
            || first != next
            || first as usize > instances.len() / 80
            || count as usize > instances.len() / 80 - first as usize
        {
            return Err(DocumentError::Invalid("curve page geometry/ranges"));
        }
        for instance in
            instances[first as usize * 80..(first + count) as usize * 80].chunks_exact(80)
        {
            validate_instance(
                instance,
                curves.len() / 32,
                images.table.len() / 24,
                pages.len(),
                clips.len() / 80,
            )?;
        }
        next += count;
        pages.push(Page {
            width,
            height,
            first,
            count,
        });
    }
    if next as usize != instances.len() / 80 {
        return Err(DocumentError::Invalid("unassigned drawing instances"));
    }
    let groups = if sections.iter().any(|s| s.tag == *b"GRUP") {
        take(&mut sections, *b"GRUP")?
    } else {
        Vec::new()
    };
    if groups
        .chunks_exact(24)
        .any(|r| matches!(u32_at(r, 12), 2 | 3))
        && !sections.iter().any(|s| s.tag == *b"MASK")
    {
        return Err(DocumentError::Invalid("missing mask extension"));
    }
    if (blends.iter().any(|b| *b >= 4)
        || groups.chunks_exact(24).any(|r| (u32_at(r, 12) & 255) >= 4))
        && !sections.iter().any(|s| s.tag == *b"BLNX")
    {
        return Err(DocumentError::Invalid("missing extended blend modes"));
    }
    if groups.chunks_exact(24).any(|r| u32_at(r, 12) & 768 != 0)
        && !sections.iter().any(|s| s.tag == *b"GFLG")
    {
        return Err(DocumentError::Invalid("missing group properties"));
    }
    crate::groups::validate(&groups, &pages)?;
    let mask_transfers = if sections.iter().any(|s| s.tag == *b"MTRF") {
        take(&mut sections, *b"MTRF")?
    } else {
        Vec::new()
    };
    crate::groups::validate_transfers(&mask_transfers, &groups)?;
    let radial_gradients = if sections.iter().any(|s| s.tag == *b"RGRD") {
        take(&mut sections, *b"RGRD")?
    } else {
        Vec::new()
    };
    if !radial_gradients.is_empty() {
        if radial_gradients.len() != images.table.len() / 24 * 64 {
            return Err(DocumentError::Invalid("radial gradient table length"));
        }
        for record in radial_gradients.chunks_exact(64) {
            let flags = f32_at(record, 40);
            if record.chunks_exact(4).any(|v| !f32_at(v, 0).is_finite())
                || !matches!(flags as u32, 0 | 1 | 3 | 5 | 7)
                || flags != (flags as u32) as f32
                || (flags != 0.0
                    && (f32_at(record, 0) <= 0.0
                        || f32_at(record, 4) <= 0.0
                        || f32_at(record, 24) < 0.0))
                || record[48..]
                    .chunks_exact(4)
                    .any(|v| !(0.0..=1.0).contains(&f32_at(v, 0)))
            {
                return Err(DocumentError::Invalid("radial gradient values"));
            }
        }
    }
    Ok(Document {
        pages,
        curves,
        instances,
        images,
        clips,
        bins,
        blends,
        groups,
        mask_transfers,
        radial_gradients,
    })
}

/// Owned CPU buffers. CURV and DRAW are already aligned to their GPU storage schemas.
#[derive(Debug, Clone)]
pub struct Document {
    /// Source pages, with contiguous instance ranges.
    pub pages: Vec<Page>,
    /// Four vec2f control points per cubic; extrema were split by the writer.
    pub curves: Vec<u8>,
    /// 80-byte affine/color/clip/range records in drawing order.
    pub instances: Vec<u8>,
    /// Shared raster resources, empty for profile 2.
    pub images: Images,
    /// Optional required CLIP extension, storing persistent analytic clip nodes.
    pub clips: Vec<u8>,
    /// Optional required BINS extension, indexing monotone curves by axis.
    pub bins: Vec<u8>,
    /// One compositing byte per draw: 0 normal, 1 multiply against an opaque page.
    pub blends: Vec<u8>,
    /// Nested isolated groups, in preorder, retaining opacity and blend mode.
    pub groups: Vec<u8>,
    /// Mask group index followed by 256 normalized f32 transfer samples per record.
    pub mask_transfers: Vec<u8>,
    /// Optional 64-byte radial shading parameters per image resource.
    pub radial_gradients: Vec<u8>,
}

/// Page dimensions and drawing range, independent of the source file format.
#[derive(Debug, Clone)]
pub struct Page {
    /// Width in source units.
    pub width: f64,
    /// Height in source units.
    pub height: f64,
    /// First drawing instance.
    pub first: u32,
    /// Number of drawing instances.
    pub count: u32,
}

/// Serializes a scene, then validates its complete profile before returning it.
pub fn encode(document: &Document) -> Result<Vec<u8>, DocumentError> {
    let bytes = encode_owned(document.clone())?;
    decode(&bytes)?;
    Ok(bytes)
}

/// Consumes importer-owned scene buffers without a second full-size decoding allocation.
/// Checks image resources and curve bins while encoding. Callers must decode/validate the
/// resulting file before rendering; the browser does this in a fresh disposable Worker.
pub fn encode_owned(document: Document) -> Result<Vec<u8>, DocumentError> {
    let (sections, profile) = scene_sections(document)?;
    container::encode_profile_owned(sections, profile)
}

/// Builds acceleration data and validates importer buffers without serializing a GDOC.
pub fn prepare_owned(document: Document) -> Result<Document, DocumentError> {
    let (sections, profile) = scene_sections(document)?;
    let mut total = 0usize;
    for section in &sections {
        if section.data.len() > crate::container::MAX_DECODED_BYTES - total {
            return Err(DocumentError::Limit("decoded size"));
        }
        total += section.data.len();
    }
    decode_sections(sections, profile)
}

fn scene_sections(mut document: Document) -> Result<(Vec<Section>, u32), DocumentError> {
    let mut pages = Vec::with_capacity(document.pages.len() * 24);
    for page in &document.pages {
        pages.extend_from_slice(&page.width.to_le_bytes());
        pages.extend_from_slice(&page.height.to_le_bytes());
        pages.extend_from_slice(&page.first.to_le_bytes());
        pages.extend_from_slice(&page.count.to_le_bytes());
    }
    if document.blends.len() != document.instances.len() / 80 {
        return Err(DocumentError::Invalid("blend record count"));
    }
    let hairlines = document
        .instances
        .chunks_exact(80)
        .any(|r| u32_at(r, 72) >= 3);
    let mut instances = std::mem::take(&mut document.instances);
    let mut clips = std::mem::take(&mut document.clips);
    let bins = crate::curve_bins::build(&document.curves, &mut instances, &mut clips)?;
    let mut sections = vec![
        Section {
            tag: *b"PAGE",
            required: true,
            data: pages,
        },
        Section {
            tag: *b"CURV",
            required: true,
            data: std::mem::take(&mut document.curves),
        },
        Section {
            tag: *b"DRAW",
            required: true,
            data: instances,
        },
    ];
    let profile = if document.images.table.is_empty() {
        2
    } else {
        3
    };
    document.images.validate()?;
    if profile == 3 {
        sections.push(Section {
            tag: *b"IMAG",
            required: true,
            data: document.images.table.clone(),
        });
        sections.push(Section {
            tag: *b"PIXL",
            required: true,
            data: std::mem::take(&mut document.images.pixels),
        });
    }
    if document
        .images
        .table
        .chunks_exact(24)
        .any(|r| u32_at(r, 20) == 4)
    {
        sections.push(Section {
            tag: *b"VTEX",
            required: true,
            data: 1u32.to_le_bytes().to_vec(),
        });
    }
    if !clips.is_empty() {
        sections.push(Section {
            tag: *b"CLIP",
            required: true,
            data: clips,
        });
    }
    if !bins.is_empty() {
        sections.push(Section {
            tag: *b"BINS",
            required: true,
            data: bins,
        });
    }
    if document.blends.iter().any(|b| *b != 0) {
        sections.push(Section {
            tag: *b"BLND",
            required: true,
            data: document.blends.clone(),
        });
    }
    if !document.radial_gradients.is_empty() {
        let mut records = document.radial_gradients.clone();
        records.resize(document.images.table.len() / 24 * 64, 0);
        sections.push(Section {
            tag: *b"RGRD",
            required: true,
            data: records,
        });
    }
    if !document.mask_transfers.is_empty() {
        sections.push(Section {
            tag: *b"MTRF",
            required: true,
            data: document.mask_transfers.clone(),
        });
    }
    if !document.groups.is_empty() {
        sections.push(Section {
            tag: *b"GRUP",
            required: true,
            data: document.groups.clone(),
        });
    }
    if document
        .images
        .table
        .chunks_exact(24)
        .any(|r| u32_at(r, 20) != 0)
    {
        sections.push(Section {
            tag: *b"IPCK",
            required: true,
            data: 1u32.to_le_bytes().to_vec(),
        });
    }
    if hairlines {
        sections.push(Section {
            tag: *b"HAIR",
            required: true,
            data: 1u32.to_le_bytes().to_vec(),
        });
    }
    if document
        .groups
        .chunks_exact(24)
        .any(|r| matches!(u32_at(r, 12), 2 | 3))
    {
        sections.push(Section {
            tag: *b"MASK",
            required: true,
            data: 1u32.to_le_bytes().to_vec(),
        });
    }
    if document.blends.iter().any(|b| *b >= 4)
        || document
            .groups
            .chunks_exact(24)
            .any(|r| (u32_at(r, 12) & 255) >= 4)
    {
        sections.push(Section {
            tag: *b"BLNX",
            required: true,
            data: 1u32.to_le_bytes().to_vec(),
        });
    }
    if document
        .groups
        .chunks_exact(24)
        .any(|r| u32_at(r, 12) & 768 != 0)
    {
        sections.push(Section {
            tag: *b"GFLG",
            required: true,
            data: 1u32.to_le_bytes().to_vec(),
        });
    }
    Ok((sections, profile))
}

fn validate_instance(
    record: &[u8],
    curves: usize,
    images: usize,
    page: usize,
    clips: usize,
) -> Result<(), DocumentError> {
    let start = u32_at(record, 64) as usize;
    let count = u32_at(record, 68) as usize;
    let kind = u32_at(record, 72);
    let valid_range = match kind {
        0 | 1 | 3..=5 => count > 0 && count <= 65536 && start <= curves && count <= curves - start,
        2 => start < images && count == 0,
        _ => false,
    };
    if !valid_range || u32_at(record, 76) as usize != page || u32_at(record, 24) as usize > clips {
        return Err(DocumentError::Invalid("drawing instance range/flags"));
    }
    for offset in (0..64)
        .step_by(4)
        .filter(|offset| !(24..32).contains(offset))
    {
        let value = f32_at(record, offset);
        if !value.is_finite()
            || value.abs() > 1.0e9
            || ((32..48).contains(&offset) && !(0.0..=1.0).contains(&value))
        {
            return Err(DocumentError::Invalid("instance transform/color"));
        }
    }
    let determinant = f64::from(f32_at(record, 0)) * f64::from(f32_at(record, 12))
        - f64::from(f32_at(record, 4)) * f64::from(f32_at(record, 8));
    if determinant == 0.0
        || f32_at(record, 48) > f32_at(record, 56)
        || f32_at(record, 52) > f32_at(record, 60)
    {
        return Err(DocumentError::Invalid("singular transform or clip"));
    }
    Ok(())
}

// A monotone cubic has a derivative quadratic with no opposite-signed interior minimum.
fn monotone(p: [f32; 4]) -> bool {
    let direction = if p[3] >= p[0] { 1.0 } else { -1.0 };
    let d = [
        f64::from(p[1] - p[0]) * direction,
        f64::from(p[2] - p[1]) * direction,
        f64::from(p[3] - p[2]) * direction,
    ];
    let a = d[0] - 2.0 * d[1] + d[2];
    let b = 2.0 * (d[1] - d[0]);
    let mut minimum = d[0].min(d[2]);
    if a > 0.0 {
        let t = -b / (2.0 * a);
        if (0.0..1.0).contains(&t) {
            minimum = minimum.min((a * t + b) * t + d[0]);
        }
    }
    minimum >= -1.0e-6
}

fn take(sections: &mut Vec<Section>, tag: [u8; 4]) -> Result<Vec<u8>, DocumentError> {
    let i = sections
        .iter()
        .position(|s| s.tag == tag)
        .ok_or(DocumentError::Invalid("missing curve section"))?;
    Ok(sections.swap_remove(i).data)
}

pub(crate) fn f32_at(bytes: &[u8], offset: usize) -> f32 {
    f32::from_bits(u32_at(bytes, offset))
}
fn f64_at(bytes: &[u8], offset: usize) -> f64 {
    f64::from_bits(u64::from(u32_at(bytes, offset)) | (u64::from(u32_at(bytes, offset + 4)) << 32))
}
