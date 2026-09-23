//! PDF importer: filled outlines, reusable glyphs/images, solid colors and rectangular clipping.
//! Unsupported drawing features fail the entire import, with their page number.

mod blend;
mod clipping;
mod components;
mod geometry;
mod gradients;
mod images;
mod mesh;
mod patterns;
mod strokes;

use crate::{
    curves::{self, Document, Page},
    error::DocumentError,
};
use geometry::{ShapeRecord, append_shape};
use hayro_interpret::hayro_syntax::Pdf;
use hayro_interpret::{
    BlendMode, CacheKey, ClipPath, Context, Device, FillRule, GlyphDrawMode, Image,
    InterpreterCache, InterpreterSettings, Paint, PathDrawMode, SoftMask, TransformExt,
    font::{FontQuery, Glyph},
    interpret_page,
};
use kurbo::{Affine, BezPath, PathEl, Rect, Shape};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

/// Converts supported PDF graphics to GDOC profile 2/3 without flattening curves into triangles.
/// Parsing is intended to run in a disposable Worker. No source bytes are uploaded to a server.
pub fn convert(bytes: &[u8]) -> Result<Vec<u8>, DocumentError> {
    if bytes.len() > crate::limits::MAX_FILE_BYTES {
        return Err(DocumentError::Limit("PDF file size"));
    }
    convert_owned(bytes.to_vec())
}

/// Consumes the PDF buffer, avoiding a second full-size copy during WASM import.
pub fn convert_owned(bytes: Vec<u8>) -> Result<Vec<u8>, DocumentError> {
    let document = interpret_pdf(bytes, &mut |_, _| {})?;
    curves::encode_owned(document)
}

/// Imports validated GPU buffers directly, without the GDOC serialization round trip.
pub fn import_owned(bytes: Vec<u8>) -> Result<Document, DocumentError> {
    curves::prepare_owned(interpret_pdf(bytes, &mut |_, _| {})?)
}

/// Imports render buffers and reports completed pages, starting with zero once the page count is known.
pub fn import_owned_with_progress(bytes: Vec<u8>, mut progress: impl FnMut(usize, usize)) -> Result<Document, DocumentError> {
    curves::prepare_owned(interpret_pdf(bytes, &mut progress)?)
}

// Drop parser/font/soft-mask state before allocating the encoded output buffer.
fn interpret_pdf(bytes: Vec<u8>, progress: &mut impl FnMut(usize, usize)) -> Result<Document, DocumentError> {
    if bytes.len() > crate::limits::MAX_FILE_BYTES {
        return Err(DocumentError::Limit("PDF file size"));
    }
    let image_capacity = if bytes.len() > 512 * 1024 * 1024 {
        (bytes.len() + bytes.len() / 2).min(crate::raster::MAX_ENCODED_IMAGE_BYTES)
    } else {
        0
    };
    let pdf = Pdf::new(bytes)
        .map_err(|_| DocumentError::Invalid("PDF cannot be parsed or requires a password"))?;
    let pages = pdf.pages();
    if pages.is_empty() || pages.len() > 10_000 {
        return Err(DocumentError::Limit("PDF page count"));
    }
    let first = pages[0].render_dimensions();
    if first.0 <= 0.0 || first.1 <= 0.0 {
        return Err(DocumentError::Invalid("PDF page dimensions"));
    }
    let normalization =
        Affine::scale_non_uniform(1.0 / f64::from(first.0), 1.0 / f64::from(first.1));
    let cache = InterpreterCache::new();
    let mut device = SceneDevice::new(normalization);
    // Large image-heavy PDFs need one contiguous arena before temporary decoding
    // allocations fragment the 32-bit WASM address space. This is CPU storage only.
    device
        .document
        .images
        .pixels
        .try_reserve_exact(image_capacity)
        .map_err(|_| DocumentError::Limit("image storage memory"))?;
    progress(0, pages.len());
    for (index, page) in pages.iter().enumerate() {
        let (width, height) = page.render_dimensions();
        let width = f64::from(width);
        let height = f64::from(height);
        if !(0.001..=1_000_000.0).contains(&width) || !(0.001..=1_000_000.0).contains(&height) {
            return Err(DocumentError::Invalid("PDF page dimensions"));
        }
        device.page = index;
        device.clips = vec![clipping::ClipState {
            bounds: Rect::new(0.0, 0.0, width, height),
            ..Default::default()
        }];
        let warned = Arc::new(AtomicBool::new(false));
        let warnings = warned.clone();
        let fonts = warned.clone();
        let settings = InterpreterSettings {
            warning_sink: Arc::new(move |_| {
                warnings.store(true, Ordering::Relaxed);
            }),
            font_resolver: Arc::new(move |query| match query {
                FontQuery::Standard(font) => Some(font.get_font_data()),
                FontQuery::Fallback(_) => {
                    fonts.store(true, Ordering::Relaxed);
                    None
                }
            }),
            ..InterpreterSettings::default()
        };
        let first_instance = (device.document.instances.len() / 80) as u32;
        let mut context = Context::new(
            page.initial_transform(true).to_kurbo(),
            Rect::new(0.0, 0.0, width, height),
            &cache,
            page.xref(),
            settings,
        );
        interpret_page(page, &mut context, &mut device);
        if let Some(error) = device.error.take() {
            return Err(match error {
                DocumentError::Limit(reason) => DocumentError::PdfLimit {
                    page: index + 1,
                    reason,
                },
                other => other,
            });
        }
        if warned.load(Ordering::Relaxed) {
            return Err(device.unsupported("missing/unsupported font or undecodable image"));
        }
        device.document.pages.push(Page {
            width,
            height,
            first: first_instance,
            count: (device.document.instances.len() / 80) as u32 - first_instance,
        });
        progress(index + 1, pages.len());
    }
    Ok(device.document)
}

struct SceneDevice<'a> {
    document: Document,
    images: images::ImageCache,
    groups: Vec<usize>,
    blend: BlendMode,
    soft_mask: Option<SoftMask<'a>>,
    glyphs: HashMap<u128, Option<ShapeRecord>>,
    normalization: Affine,
    clips: Vec<clipping::ClipState>,
    clip_cache: HashMap<(u128, u32), u32>,
    pattern_depth: usize,
    page: usize,
    error: Option<DocumentError>,
}

impl<'a> SceneDevice<'a> {
    fn new(normalization: Affine) -> Self {
        Self {
            document: Document {
                pages: Vec::new(),
                curves: Vec::new(),
                instances: Vec::new(),
                images: Default::default(),
                clips: Vec::new(),
                bins: Vec::new(),
                blends: Vec::new(),
                groups: Vec::new(),
                mask_transfers: Vec::new(),
                radial_gradients: Vec::new(),
            },
            images: Default::default(),
            groups: Vec::new(),
            blend: BlendMode::Normal,
            soft_mask: None,
            glyphs: HashMap::new(),
            normalization,
            clips: Vec::new(),
            clip_cache: HashMap::new(),
            pattern_depth: 0,
            page: 0,
            error: None,
        }
    }

    fn unsupported(&self, reason: &str) -> DocumentError {
        DocumentError::PdfUnsupported {
            page: self.page + 1,
            reason: reason.to_owned(),
        }
    }

    fn reject(&mut self, reason: &str) {
        if self.error.is_none() {
            self.error = Some(self.unsupported(reason));
        }
    }

    fn add(
        &mut self,
        shape: Option<ShapeRecord>,
        transform: Affine,
        paint: &Paint<'_>,
        fill: FillRule,
    ) {
        if self.error.is_some() {
            return;
        }
        let Some(shape) = shape else {
            return;
        };
        let Paint::Color(color) = paint else {
            self.reject("patterns and gradients");
            return;
        };
        self.add_instance(
            shape,
            transform,
            color.to_rgba().components(),
            u32::from(matches!(fill, FillRule::EvenOdd)),
        );
    }

    fn add_instance(&mut self, shape: ShapeRecord, transform: Affine, color: [f32; 4], kind: u32) {
        if self.error.is_some() {
            return;
        }
        if let Some(mask) = self.soft_mask.take() {
            let blend = self.blend;
            self.push_transparency_group(1.0, Some(mask.clone()), blend);
            self.blend = BlendMode::Normal;
            self.add_instance(shape, transform, color, kind);
            self.pop_transparency_group();
            self.blend = blend;
            self.soft_mask = Some(mask);
            return;
        }
        if self.document.instances.len() / 80 >= 1_500_000 {
            self.error = Some(DocumentError::Limit("drawing instances"));
            return;
        }
        let affine = self.normalization * transform * shape.from_unit;
        if affine.determinant() == 0.0 {
            return;
        }
        let a = affine.as_coeffs();
        let state = self.clips.last().copied().unwrap_or_default();
        let clip = state.bounds;
        if clip.width() <= 0.0 || clip.height() <= 0.0 {
            return;
        }
        let clip = self.normalization.transform_rect_bbox(clip);
        self.document.blends.push(blend::encode(self.blend));
        let values = [a[0], a[1], a[2], a[3], a[4], a[5]];
        for value in values {
            self.document
                .instances
                .extend_from_slice(&(value as f32).to_le_bytes());
        }
        self.document
            .instances
            .extend_from_slice(&state.reference.to_le_bytes());
        self.document
            .instances
            .extend_from_slice(&0u32.to_le_bytes());

        for value in color {
            self.document
                .instances
                .extend_from_slice(&value.to_le_bytes());
        }
        for value in [clip.x0, clip.y0, clip.x1, clip.y1] {
            self.document
                .instances
                .extend_from_slice(&(value as f32).to_le_bytes());
        }
        for value in [shape.first, shape.count, kind, self.page as u32] {
            self.document
                .instances
                .extend_from_slice(&value.to_le_bytes());
        }
    }
}

impl<'a> Device<'a> for SceneDevice<'a> {
    fn draw_path(
        &mut self,
        path: &BezPath,
        transform: Affine,
        paint: &Paint<'a>,
        mode: &PathDrawMode,
    ) {
        if self.error.is_some() {
            return;
        }
        if let PathDrawMode::Stroke(props) = mode
            && props.line_width == 0.0
        {
            self.draw_hairline(path, transform, paint, props);
            return;
        }
        let expanded;
        let (path, fill) = match mode {
            PathDrawMode::Fill(fill) => (path, *fill),
            PathDrawMode::Stroke(props) => {
                match strokes::outline(path, props) {
                    Ok(outline) => expanded = outline,
                    Err(DocumentError::Unsupported(reason)) => {
                        self.reject(reason);
                        return;
                    }
                    Err(error) => {
                        self.error = Some(error);
                        return;
                    }
                }
                (&expanded, FillRule::NonZero)
            }
        };
        if let Paint::Pattern(pattern) = paint {
            self.draw_pattern(
                path,
                transform,
                fill,
                pattern,
                matches!(mode, PathDrawMode::Stroke(_)),
            );
            return;
        }
        let parts = match components::split(path) {
            Ok(parts) => parts,
            Err(error) => {
                self.error = Some(error);
                return;
            }
        };
        for part in parts {
            match append_shape(&part, &mut self.document.curves) {
                Ok(shape) => self.add(shape, transform, paint, fill),
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
    }

    fn draw_glyph(
        &mut self,
        glyph: &Glyph<'a>,
        transform: Affine,
        glyph_transform: Affine,
        paint: &Paint<'a>,
        mode: &GlyphDrawMode,
    ) {
        if self.error.is_some() || matches!(mode, GlyphDrawMode::Invisible) {
            return;
        }
        let Glyph::Outline(glyph) = glyph else {
            let Glyph::Type3(glyph) = glyph else {
                return;
            };
            let clips = self.clips.clone();
            let blend = self.blend;
            let mask = self.soft_mask.clone();
            glyph.interpret(self, transform, glyph_transform, paint);
            self.clips = clips;
            self.blend = blend;
            self.soft_mask = mask;
            return;
        };
        if let GlyphDrawMode::Stroke(props) = mode {
            self.draw_path(
                &(glyph_transform * glyph.outline()),
                transform,
                paint,
                &PathDrawMode::Stroke(props.clone()),
            );
            return;
        }
        if matches!(paint, Paint::Pattern(_)) {
            self.draw_path(
                &glyph.outline(),
                transform * glyph_transform,
                paint,
                &PathDrawMode::Fill(FillRule::NonZero),
            );
            return;
        }
        let key = glyph.identifier().cache_key();
        let shape = match self.glyphs.get(&key) {
            Some(shape) => *shape,
            None => match append_shape(&glyph.outline(), &mut self.document.curves) {
                Ok(shape) => {
                    self.glyphs.insert(key, shape);
                    shape
                }
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            },
        };
        self.add(shape, transform * glyph_transform, paint, FillRule::NonZero);
    }

    fn push_clip_path(&mut self, clip: &ClipPath) {
        if self.error.is_some() {
            return;
        }
        match self.append_clip(clip) {
            Ok(state) => self.clips.push(state),
            Err(error) => self.error = Some(error),
        }
    }

    fn pop_clip_path(&mut self) {
        if self.clips.len() > 1 {
            self.clips.pop();
        }
    }
    fn set_soft_mask(&mut self, mask: Option<SoftMask<'a>>) {
        self.soft_mask = mask;
    }
    fn set_blend_mode(&mut self, blend: BlendMode) {
        self.blend = blend;
    }
    fn push_transparency_group(
        &mut self,
        opacity: f32,
        mask: Option<SoftMask<'a>>,
        blend: BlendMode,
    ) {
        self.begin_group(opacity, u32::from(blend::encode(blend)));
        if let Some(mask) = mask {
            self.append_soft_mask(mask);
        }
    }
    fn push_form_group(
        &mut self,
        opacity: f32,
        mask: Option<SoftMask<'a>>,
        blend: BlendMode,
        isolated: bool,
        knockout: bool,
    ) {
        let offset = self.document.groups.len() + 12;
        self.push_transparency_group(opacity, mask, blend);
        let flags = u32::from(!isolated) * 256 + u32::from(knockout) * 512;
        self.document.groups[offset..offset + 4]
            .copy_from_slice(&(u32::from(blend::encode(blend)) | flags).to_le_bytes());
    }

    fn pop_transparency_group(&mut self) {
        let Some(index) = self.groups.pop() else {
            return;
        };
        let end = (self.document.instances.len() / 80) as u32;
        self.document.groups[index * 24 + 4..index * 24 + 8].copy_from_slice(&end.to_le_bytes());
    }

    fn draw_image(&mut self, image: Image<'a, '_>, transform: Affine) {
        if self.error.is_some() {
            return;
        }
        match self.images.resolve(image, &mut self.document.images) {
            Ok((image, tint)) => self.add_instance(
                ShapeRecord {
                    first: image.index,
                    count: 0,
                    from_unit: image.from_unit,
                },
                transform,
                tint,
                2,
            ),
            Err(DocumentError::Unsupported(reason)) => self.reject(reason),
            Err(error) => self.error = Some(error),
        }
    }
}

fn axis_aligned_rect(path: &BezPath) -> Option<Rect> {
    let mut points = Vec::new();
    for element in path.elements() {
        match element {
            PathEl::MoveTo(p) if points.is_empty() => points.push(*p),
            PathEl::LineTo(p) => points.push(*p),
            PathEl::ClosePath => {}
            _ => return None,
        }
    }
    if points.len() == 5 && points[0] == points[4] {
        points.pop();
    }
    if points.len() != 4 {
        return None;
    }
    for i in 0..4 {
        let a = points[i];
        let b = points[(i + 1) % 4];
        if (a.x == b.x) == (a.y == b.y) {
            return None;
        }
    }
    Some(path.bounding_box())
}

impl<'a> SceneDevice<'a> {
    fn draw_hairline(
        &mut self,
        path: &BezPath,
        transform: Affine,
        paint: &Paint<'_>,
        props: &hayro_interpret::StrokeProps,
    ) {
        let Paint::Color(color) = paint else {
            self.reject("pattern-painted hairlines");
            return;
        };
        // Reuse stroke validation and the dash-expansion budget before invoking the dash iterator.
        let mut validation = props.clone();
        validation.line_width = 1.0;
        if let Err(error) = strokes::outline(path, &validation) {
            self.error = Some(error);
            return;
        }
        let dashed;
        let path = if props.dash_array.is_empty() {
            path
        } else {
            let dashes: Vec<f64> = props.dash_array.iter().map(|v| f64::from(*v)).collect();
            dashed = kurbo::dash(path.iter(), f64::from(props.dash_offset), &dashes)
                .collect::<BezPath>();
            &dashed
        };
        let kind = match props.line_cap {
            kurbo::Cap::Butt => 3,
            kurbo::Cap::Round => 4,
            kurbo::Cap::Square => 5,
        };
        for segment in path.segments() {
            match geometry::append_hairline(segment.to_cubic(), &mut self.document.curves) {
                Ok(shape) => {
                    self.add_instance(shape, transform, color.to_rgba().components(), kind)
                }
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
    }
}

impl<'a> SceneDevice<'a> {
    fn begin_group(&mut self, opacity: f32, kind: u32) {
        let index = self.document.groups.len() / 24;
        let parent = self.groups.last().map_or(0, |index| *index as u32 + 1);
        for n in [
            (self.document.instances.len() / 80) as u32,
            0,
            opacity.to_bits(),
            kind,
            parent,
            self.page as u32,
        ] {
            self.document.groups.extend_from_slice(&n.to_le_bytes());
        }
        self.groups.push(index);
        if self.groups.len() > 32 {
            self.reject("transparency group depth");
        }
    }

    fn append_soft_mask(&mut self, mask: SoftMask<'a>) {
        if self.error.is_some() {
            return;
        }
        let [r, g, b, _] = mask.background_color().to_rgba().components();
        let kind = match mask.mask_type() {
            hayro_interpret::MaskType::Alpha => 2,
            hayro_interpret::MaskType::Luminosity => 3,
        };
        let index = (self.document.groups.len() / 24) as u32;
        if let Some(transfer) = mask.transfer_function() {
            self.document
                .mask_transfers
                .extend_from_slice(&index.to_le_bytes());
            for sample in 0..256 {
                self.document
                    .mask_transfers
                    .extend_from_slice(&transfer.apply(sample as f32 / 255.0).to_le_bytes());
            }
        }
        self.begin_group(r * 0.3 + g * 0.59 + b * 0.11, kind);
        let previous = self.soft_mask.take();
        let blend = self.blend;
        let clips = self.clips.clone();
        self.blend = BlendMode::Normal;
        mask.interpret(self);
        self.soft_mask = previous;
        self.blend = blend;
        self.clips = clips;
        self.pop_transparency_group();
    }
}
