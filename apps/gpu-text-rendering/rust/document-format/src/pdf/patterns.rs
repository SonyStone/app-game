//! Tiling patterns reuse the same vector/image interpreter under the painted shape's clip.

use super::SceneDevice;
use hayro_interpret::{
    ClipPath, Device, FillRule,
    pattern::{Pattern, TilingPattern},
};
use kurbo::{Affine, BezPath, Shape};

impl<'a> SceneDevice<'a> {
    pub(super) fn draw_pattern(
        &mut self,
        path: &BezPath,
        transform: Affine,
        fill: FillRule,
        pattern: &Pattern<'a>,
        is_stroke: bool,
    ) {
        if let Pattern::Shading(pattern) = pattern {
            self.draw_gradient(path, transform, fill, pattern);
            return;
        }
        if self.blend != hayro_interpret::BlendMode::Normal {
            self.reject("tiling patterns with blend modes");
            return;
        }
        let Pattern::Tiling(pattern) = pattern else {
            self.reject("shading patterns and gradients");
            return;
        };
        if self.pattern_depth >= 16 {
            self.reject("pattern nesting depth");
            return;
        }
        let bounds = (transform * path.clone()).bounding_box();
        if pattern.matrix.determinant() == 0.0 || bounds.area() == 0.0 {
            return;
        }
        let inverse = pattern.matrix.inverse();
        let clip_bounds = self
            .clips
            .last()
            .copied()
            .unwrap_or_default()
            .bounds
            .intersect(bounds);
        if clip_bounds.width() <= 0.0 || clip_bounds.height() <= 0.0 {
            return;
        }
        let bounds = inverse.transform_rect_bbox(clip_bounds);
        let sx = f64::from(pattern.x_step).abs();
        let sy = f64::from(pattern.y_step).abs();
        let x0 = ((bounds.x0 - pattern.bbox.x1) / sx).ceil();
        let x1 = ((bounds.x1 - pattern.bbox.x0) / sx).floor();
        let y0 = ((bounds.y0 - pattern.bbox.y1) / sy).ceil();
        let y1 = ((bounds.y1 - pattern.bbox.y0) / sy).floor();
        if ![x0, x1, y0, y1]
            .iter()
            .all(|n| n.is_finite() && n.abs() < 1.0e9)
            || (x1 - x0 + 1.0) * (y1 - y0 + 1.0) > 65536.0
        {
            self.reject("pattern cell count");
            return;
        }

        let depth = self.clips.len();
        let blend = self.blend;
        self.push_clip_path(&ClipPath {
            path: transform * path.clone(),
            fill,
        });
        self.pattern_depth += 1;
        for y in y0 as i64..=y1 as i64 {
            for x in x0 as i64..=x1 as i64 {
                if self.error.is_some() {
                    break;
                }
                self.draw_tile(
                    pattern,
                    pattern.matrix * Affine::translate((x as f64 * sx, y as f64 * sy)),
                    is_stroke,
                );
            }
            if self.error.is_some() {
                break;
            }
        }
        self.pattern_depth -= 1;
        self.clips.truncate(depth);
        self.blend = blend;
    }

    fn draw_tile(&mut self, pattern: &TilingPattern<'a>, transform: Affine, is_stroke: bool) {
        if pattern.interpret(self, transform, is_stroke).is_none() {
            self.reject("undecodable tiling pattern");
        }
    }
}
