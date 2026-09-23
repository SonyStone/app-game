//! Ownership-explicit WASM adapter. Invalid documents return data, not JS exceptions.

use crate::{container::u32_at, curves, error::DocumentError, quadratic};
use wasm_bindgen::prelude::*;

/// Decode synchronously inside a dedicated Worker; cancellation terminates that Worker.
#[wasm_bindgen(js_name = decodeDocument)]
pub fn decode_document(bytes: &[u8]) -> DecodeOutcome {
    match decode(bytes) {
        Ok(document) => DecodeOutcome {
            document: Some(document),
            error: None,
        },
        Err(error) => DecodeOutcome {
            document: None,
            error: Some(error),
        },
    }
}

/// Owns either validated data or a typed error. Free after taking the document.
#[wasm_bindgen]
pub struct DecodeOutcome {
    document: Option<DecodedDocument>,
    error: Option<DocumentError>,
}

#[wasm_bindgen]
impl DecodeOutcome {
    /// Stable error category; empty on success.
    #[wasm_bindgen(getter, js_name = errorCode)]
    pub fn error_code(&self) -> String {
        self.error
            .as_ref()
            .map_or(String::new(), |error| error.code().to_owned())
    }

    /// Human-readable details; empty on success.
    #[wasm_bindgen(getter, js_name = errorMessage)]
    pub fn error_message(&self) -> String {
        self.error
            .as_ref()
            .map_or(String::new(), ToString::to_string)
    }

    /// Transfers document ownership once. Returns undefined on failure/subsequent calls.
    #[wasm_bindgen(js_name = takeDocument)]
    pub fn take_document(&mut self) -> Option<DecodedDocument> {
        self.document.take()
    }
}

/// CPU buffers; each `take` transfers a buffer out once. Free after extraction.
#[wasm_bindgen]
#[derive(Default)]
pub struct DecodedDocument {
    profile: u32,
    pages: Vec<f64>,
    positions_x: Vec<f32>,
    positions_y: Vec<f32>,
    curves: Vec<u8>,
    instances: Vec<u8>,
    clips: Vec<u8>,
    bins: Vec<u8>,
    blends: Vec<u8>,
    groups: Vec<u8>,
    mask_transfers: Vec<u8>,
    radial_gradients: Vec<u8>,
    image_table: Vec<u8>,
    image_pixels: Vec<u8>,
    vertices: Vec<u8>,
    dimensions: [u32; 4],
    atlas: Vec<u8>,
    atlas_vertices: Vec<u8>,
}

#[wasm_bindgen]
impl DecodedDocument {
    /// Rendering profile: 1 atlas glyphs, 2 cubic contours, 3 contours with raster images.
    #[wasm_bindgen(getter)]
    pub fn profile(&self) -> u32 {
        self.profile
    }

    /// Four vec2f points per monotone cubic.
    #[wasm_bindgen(js_name = takeCurves)]
    pub fn take_curves(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.curves)
    }

    /// Ordered 80-byte affine/color/clip/range records.
    #[wasm_bindgen(js_name = takeInstances)]
    pub fn take_instances(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.instances)
    }

    /// Per-draw compositing modes, with normal blending represented by zero.
    #[wasm_bindgen(js_name = takeBlends)]
    pub fn take_blends(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.blends)
    }

    /// Nested isolated transparency groups, 24 bytes per record.
    #[wasm_bindgen(js_name = takeGroups)]
    pub fn take_groups(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.groups)
    }

    /// Soft-mask transfer lookup tables, indexed by group record.
    #[wasm_bindgen(js_name = takeMaskTransfers)]
    pub fn take_mask_transfers(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.mask_transfers)
    }

    /// Analytic radial shading metadata, indexed by image resource.
    #[wasm_bindgen(js_name = takeRadialGradients)]
    pub fn take_radial_gradients(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.radial_gradients)
    }

    /// Curve row/column lookup table, addressed by DRAW/CLIP records.
    #[wasm_bindgen(js_name = takeCurveBins)]
    pub fn take_curve_bins(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.bins)
    }

    /// Analytic clipping nodes; an empty buffer means only rectangular clipping.
    #[wasm_bindgen(js_name = takeClips)]
    pub fn take_clips(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.clips)
    }

    /// 24-byte image metadata records, empty for profiles 1 and 2.
    #[wasm_bindgen(js_name = takeImageTable)]
    pub fn take_image_table(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.image_table)
    }

    /// Premultiplied RGBA8 pixels, owned by the caller after extraction.
    #[wasm_bindgen(js_name = takeImagePixels)]
    pub fn take_image_pixels(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.image_pixels)
    }

    /// Flat width/height/first-instance/instance-count tuples, using doubles for exact page dimensions.
    #[wasm_bindgen(js_name = takePages)]
    pub fn take_pages(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.pages)
    }

    /// Six 12-byte vertices per glyph, little-endian.
    #[wasm_bindgen(js_name = takeVertices)]
    pub fn take_vertices(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.vertices)
    }

    /// Normalized outline-center x coordinates.
    #[wasm_bindgen(js_name = takePositionsX)]
    pub fn take_positions_x(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.positions_x)
    }

    /// Normalized outline-center y coordinates, increasing down the page.
    #[wasm_bindgen(js_name = takePositionsY)]
    pub fn take_positions_y(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.positions_y)
    }

    /// Curve texture width and height, followed by prerender texture width and height.
    pub fn dimensions(&self) -> Vec<u32> {
        self.dimensions.to_vec()
    }

    /// Exact curve metadata texels.
    #[wasm_bindgen(js_name = takeAtlas)]
    pub fn take_atlas(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.atlas)
    }

    /// Vertices for prerendering the small-text coverage atlas.
    #[wasm_bindgen(js_name = takeAtlasVertices)]
    pub fn take_atlas_vertices(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.atlas_vertices)
    }
}

fn decode(bytes: &[u8]) -> Result<DecodedDocument, DocumentError> {
    if bytes.len() >= 16 && matches!(u32_at(bytes, 12), 2 | 3) {
        let scene = curves::decode(bytes)?;
        let mut x = Vec::new();
        let mut y = Vec::new();
        for record in scene.instances.chunks_exact(80) {
            x.push(
                curves::f32_at(record, 16)
                    + (curves::f32_at(record, 0) + curves::f32_at(record, 8)) * 0.5,
            );
            y.push(
                curves::f32_at(record, 20)
                    + (curves::f32_at(record, 4) + curves::f32_at(record, 12)) * 0.5,
            );
        }
        Ok(DecodedDocument {
            profile: u32_at(bytes, 12),
            image_table: scene.images.table,
            image_pixels: scene.images.pixels,
            curves: scene.curves,
            instances: scene.instances,
            clips: scene.clips,
            bins: scene.bins,
            blends: scene.blends,
            groups: scene.groups,
            mask_transfers: scene.mask_transfers,
            radial_gradients: scene.radial_gradients,
            pages: scene
                .pages
                .into_iter()
                .flat_map(|p| [p.width, p.height, f64::from(p.first), f64::from(p.count)])
                .collect(),
            positions_x: x,
            positions_y: y,
            ..DecodedDocument::default()
        })
    } else {
        let document = quadratic::decode(bytes)?;
        Ok(DecodedDocument {
            profile: 1,
            pages: document
                .pages
                .into_iter()
                .flat_map(|p| {
                    [
                        p.width,
                        p.height,
                        f64::from(p.first_glyph),
                        f64::from(p.glyph_count),
                    ]
                })
                .collect(),
            positions_x: document.positions_x,
            positions_y: document.positions_y,
            vertices: document.vertices,
            dimensions: [
                document.atlas.width,
                document.atlas.height,
                document.prerender.width,
                document.prerender.height,
            ],
            atlas: document.atlas.data,
            atlas_vertices: document.prerender.data,
            ..DecodedDocument::default()
        })
    }
}

/// Converts locally inside a disposable Worker; expected PDF failures never throw into JS.
#[cfg(feature = "pdf")]
#[wasm_bindgen(js_name = convertPdf)]
pub fn convert_pdf(bytes: Vec<u8>) -> ConvertOutcome {
    match crate::pdf::convert_owned(bytes) {
        Ok(bytes) => ConvertOutcome {
            bytes: Some(bytes),
            error: None,
        },
        Err(error) => ConvertOutcome {
            bytes: None,
            error: Some(error),
        },
    }
}

/// Owns either the encoded GDOC or a stable error. Free after extraction.
#[cfg(feature = "pdf")]
#[wasm_bindgen]
pub struct ConvertOutcome {
    bytes: Option<Vec<u8>>,
    error: Option<DocumentError>,
}

#[cfg(feature = "pdf")]
#[wasm_bindgen]
impl ConvertOutcome {
    /// Transfers the encoded file once; undefined means conversion failed.
    #[wasm_bindgen(js_name = takeBytes)]
    pub fn take_bytes(&mut self) -> Option<Vec<u8>> {
        self.bytes.take()
    }
    /// Empty on success.
    #[wasm_bindgen(getter, js_name = errorCode)]
    pub fn error_code(&self) -> String {
        self.error
            .as_ref()
            .map_or(String::new(), |e| e.code().to_owned())
    }
    /// Human-readable detail, including the failing page for unsupported PDF drawing features.
    #[wasm_bindgen(getter, js_name = errorMessage)]
    pub fn error_message(&self) -> String {
        self.error
            .as_ref()
            .map_or(String::new(), ToString::to_string)
    }
}

/// Decodes retained PDF CMYK/YCCK without the inversion applied by browser JPEG readers.
#[wasm_bindgen(js_name = decodeCmykJpeg)]
pub fn decode_cmyk_jpeg(bytes: &[u8], width: u32, height: u32) -> RasterOutcome {
    match crate::raster_jpeg::decode(bytes, width, height) {
        Ok(pixels) => RasterOutcome {
            pixels: Some(pixels),
            error: None,
        },
        Err(error) => RasterOutcome {
            pixels: None,
            error: Some(error),
        },
    }
}

/// Owns a decoded image or a typed failure; free after taking the pixels.
#[wasm_bindgen]
pub struct RasterOutcome {
    pixels: Option<Vec<u8>>,
    error: Option<DocumentError>,
}

#[wasm_bindgen]
impl RasterOutcome {
    /// Transfers opaque RGBA8 once; undefined indicates failure or a previous transfer.
    #[wasm_bindgen(js_name = takePixels)]
    pub fn take_pixels(&mut self) -> Option<Vec<u8>> {
        self.pixels.take()
    }

    /// Stable error category; empty on success.
    #[wasm_bindgen(getter, js_name = errorCode)]
    pub fn error_code(&self) -> String {
        self.error
            .as_ref()
            .map_or(String::new(), |error| error.code().to_owned())
    }

    /// Human-readable details; empty on success.
    #[wasm_bindgen(getter, js_name = errorMessage)]
    pub fn error_message(&self) -> String {
        self.error
            .as_ref()
            .map_or(String::new(), ToString::to_string)
    }
}
