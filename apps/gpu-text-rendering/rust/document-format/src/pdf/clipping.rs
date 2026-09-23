//! Persistent analytic clip chains. Rectangles stay in DRAW's inexpensive bounds field.

use super::{SceneDevice, geometry::append_shape};
use crate::error::DocumentError;
use hayro_interpret::{CacheKey, ClipPath, FillRule};
use kurbo::{Affine, Rect, Shape};

#[derive(Clone, Copy, Default)]
pub(super) struct ClipState {
    pub bounds: Rect,
    pub reference: u32,
    pub depth: u32,
}

impl SceneDevice<'_> {
    pub(super) fn append_clip(&mut self, clip: &ClipPath) -> Result<ClipState, DocumentError> {
        let previous = self.clips.last().copied().unwrap_or_default();
        let bounds = previous.bounds.intersect(clip.path.bounding_box());

        if super::axis_aligned_rect(&clip.path).is_some() {
            return Ok(ClipState { bounds, ..previous });
        }

        if previous.depth >= 32 {
            return Err(DocumentError::Limit("clip chain depth"));
        }

        let key = (clip.cache_key(), previous.reference);
        if let Some(reference) = self.clip_cache.get(&key) {
            return Ok(ClipState {
                bounds,
                reference: *reference,
                depth: previous.depth + 1,
            });
        }

        let Some(shape) = append_shape(&clip.path, &mut self.document.curves)? else {
            return Ok(ClipState {
                bounds: Rect::ZERO,
                ..previous
            });
        };
        let inverse = (self.normalization * shape.from_unit).inverse();
        write_clip(
            &mut self.document.clips,
            inverse,
            shape.first,
            shape.count,
            clip.fill,
            previous.reference,
        );
        let reference = (self.document.clips.len() / 80) as u32;
        self.clip_cache.insert(key, reference);

        Ok(ClipState {
            bounds,
            reference,
            depth: previous.depth + 1,
        })
    }
}

fn write_clip(
    bytes: &mut Vec<u8>,
    inverse: Affine,
    first: u32,
    count: u32,
    fill: FillRule,
    parent: u32,
) {
    for n in inverse.as_coeffs() {
        bytes.extend_from_slice(&(n as f32).to_le_bytes());
    }
    bytes.extend_from_slice(&[0; 8]);
    // Same storage schema as DRAW; paint and rectangular bounds are unused by clip nodes.
    for n in [1.0f32, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0] {
        bytes.extend_from_slice(&n.to_le_bytes());
    }
    for n in [
        first,
        count,
        u32::from(matches!(fill, FillRule::EvenOdd)),
        parent,
    ] {
        bytes.extend_from_slice(&n.to_le_bytes());
    }
}
