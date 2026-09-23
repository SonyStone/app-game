//! Color functions are sampled once; clipping and radial circle geometry stay analytic.
use super::{SceneDevice, geometry::ShapeRecord};
use crate::{error::DocumentError, raster::MAX_ENCODED_IMAGE_BYTES};
use hayro_interpret::{ClipPath, Device, FillRule, pattern::ShadingPattern, shading::ShadingType};
use kurbo::{Affine, BezPath};

impl SceneDevice<'_> {
    pub(super) fn draw_gradient(
        &mut self,
        path: &BezPath,
        transform: Affine,
        fill: FillRule,
        pattern: &ShadingPattern,
    ) {
        let depth = self.clips.len();
        self.push_clip_path(&ClipPath {
            path: transform * path.clone(),
            fill,
        });
        if let Some(path) = &pattern.shading.clip_path {
            self.push_clip_path(&ClipPath {
                path: path.clone(),
                fill: FillRule::NonZero,
            });
        }
        if self.error.is_none()
            && let Err(error) = self.append_gradient(pattern)
        {
            self.error = Some(error);
        }
        self.clips.truncate(depth);
    }

    fn append_gradient(&mut self, pattern: &ShadingPattern) -> Result<(), DocumentError> {
        if let ShadingType::FunctionBased {
            domain,
            matrix,
            function,
        } = pattern.shading.shading_type.as_ref()
        {
            return self.append_function_gradient(pattern, *domain, *matrix, function);
        }
        if let ShadingType::RadialAxial { axial: false, .. } = pattern.shading.shading_type.as_ref()
        {
            return self.append_radial_gradient(pattern);
        }
        let ShadingType::RadialAxial {
            coords,
            domain,
            function,
            extend,
            axial: true,
        } = pattern.shading.shading_type.as_ref()
        else {
            return match pattern.shading.shading_type.as_ref() {
                ShadingType::Dummy => Ok(()),
                _ => self.append_mesh_gradient(pattern),
            };
        };
        let dx = f64::from(coords[2] - coords[0]);
        let dy = f64::from(coords[3] - coords[1]);
        let axis = pattern.matrix
            * Affine::new([dx, dy, -dy, dx, f64::from(coords[0]), f64::from(coords[1])]);
        if axis.determinant() == 0.0 || !axis.as_coeffs().iter().all(|v| v.is_finite()) {
            return Err(DocumentError::Invalid("gradient axis"));
        }
        let clip = self.clips.last().copied().unwrap_or_default().bounds;
        if clip.width() <= 0.0 || clip.height() <= 0.0 {
            return Ok(());
        }
        let bounds = axis.inverse().transform_rect_bbox(clip);
        if self.document.images.table.len() / 24 >= 10_000
            || self.document.images.pixels.len() + 4096 * 4 > MAX_ENCODED_IMAGE_BYTES
        {
            return Err(DocumentError::Limit("gradient image resources"));
        }
        let image = (self.document.images.table.len() / 24) as u32;
        for value in [
            4096,
            1,
            self.document.images.pixels.len() as u32,
            4096 * 4,
            1,
            0,
        ] {
            self.document
                .images
                .table
                .extend_from_slice(&value.to_le_bytes());
        }
        for i in 0..4096 {
            let t = bounds.x0 + (f64::from(i) + 0.5) / 4096.0 * bounds.width();
            let outside = (t < 0.0 && !extend[0]) || (t > 1.0 && !extend[1]);
            let components = if outside {
                pattern.shading.background.clone()
            } else {
                function.eval(
                    &[domain[0] + t.clamp(0.0, 1.0) as f32 * (domain[1] - domain[0])]
                        .into_iter()
                        .collect(),
                )
            };
            if let Some(components) = components {
                let mut color =
                    pattern
                        .shading
                        .color_space
                        .to_rgba(&components, pattern.opacity, false);
                if let Some(transfer) = &pattern.transfer_function {
                    color = transfer.apply(&color);
                }
                self.document
                    .images
                    .pixels
                    .extend(color.premultiplied().map(|v| (v * 255.0 + 0.5) as u8));
            } else if outside {
                self.document.images.pixels.extend_from_slice(&[0; 4]);
            } else {
                return Err(DocumentError::Invalid("gradient color function"));
            }
        }
        self.add_instance(
            ShapeRecord {
                first: image,
                count: 0,
                from_unit: Affine::IDENTITY,
            },
            axis * Affine::translate((bounds.x0, bounds.y0))
                * Affine::scale_non_uniform(bounds.width(), bounds.height()),
            [1.0; 4],
            2,
        );
        Ok(())
    }

    fn append_radial_gradient(&mut self, pattern: &ShadingPattern) -> Result<(), DocumentError> {
        let ShadingType::RadialAxial {
            coords,
            domain,
            function,
            extend,
            ..
        } = pattern.shading.shading_type.as_ref()
        else {
            return Err(DocumentError::Invalid("radial shading"));
        };
        if pattern.matrix.determinant() == 0.0 || coords[2] < 0.0 || coords[5] < 0.0 {
            return Err(DocumentError::Invalid("radial gradient circles"));
        }
        let clip = self.clips.last().copied().unwrap_or_default().bounds;
        if clip.width() <= 0.0 || clip.height() <= 0.0 {
            return Ok(());
        }
        let bounds = pattern.matrix.inverse().transform_rect_bbox(clip);
        let scale = bounds.width().max(bounds.height());
        let image = (self.document.images.table.len() / 24) as u32;
        if image >= 10_000 || self.document.images.pixels.len() + 4096 * 4 > MAX_ENCODED_IMAGE_BYTES
        {
            return Err(DocumentError::Limit("gradient image resources"));
        }
        for value in [
            4096,
            1,
            self.document.images.pixels.len() as u32,
            4096 * 4,
            1,
            0,
        ] {
            self.document
                .images
                .table
                .extend_from_slice(&value.to_le_bytes());
        }
        for sample in 0..4096 {
            let components = function
                .eval(
                    &[domain[0] + sample as f32 / 4095.0 * (domain[1] - domain[0])]
                        .into_iter()
                        .collect(),
                )
                .ok_or(DocumentError::Invalid("gradient color function"))?;
            let mut color =
                pattern
                    .shading
                    .color_space
                    .to_rgba(&components, pattern.opacity, false);
            if let Some(transfer) = &pattern.transfer_function {
                color = transfer.apply(&color);
            }
            self.document
                .images
                .pixels
                .extend(color.premultiplied().map(|v| (v * 255.0 + 0.5) as u8));
        }
        let background = pattern
            .shading
            .background
            .as_ref()
            .map_or([0.0; 4], |components| {
                let mut color =
                    pattern
                        .shading
                        .color_space
                        .to_rgba(components, pattern.opacity, false);
                if let Some(transfer) = &pattern.transfer_function {
                    color = transfer.apply(&color);
                }
                color.premultiplied()
            });
        self.document
            .radial_gradients
            .resize(image as usize * 64, 0);
        let values = [
            (bounds.width() / scale) as f32,
            (bounds.height() / scale) as f32,
            0.0,
            0.0,
            ((f64::from(coords[0]) - bounds.x0) / scale) as f32,
            ((f64::from(coords[1]) - bounds.y0) / scale) as f32,
            (f64::from(coords[2]) / scale) as f32,
            (f64::from(coords[5] - coords[2]) / scale) as f32,
            (f64::from(coords[3] - coords[0]) / scale) as f32,
            (f64::from(coords[4] - coords[1]) / scale) as f32,
            (1 + u32::from(extend[0]) * 2 + u32::from(extend[1]) * 4) as f32,
            0.0,
            background[0],
            background[1],
            background[2],
            background[3],
        ];
        for value in values {
            self.document
                .radial_gradients
                .extend_from_slice(&value.to_le_bytes());
        }
        self.add_instance(
            ShapeRecord {
                first: image,
                count: 0,
                from_unit: Affine::IDENTITY,
            },
            pattern.matrix
                * Affine::translate((bounds.x0, bounds.y0))
                * Affine::scale_non_uniform(bounds.width(), bounds.height()),
            [1.0; 4],
            2,
        );
        Ok(())
    }

    fn append_function_gradient(
        &mut self,
        pattern: &ShadingPattern,
        domain: [f32; 4],
        matrix: Affine,
        function: &hayro_interpret::shading::ShadingFunction,
    ) -> Result<(), DocumentError> {
        let axis = pattern.matrix * matrix;
        let width = f64::from(domain[1] - domain[0]);
        let height = f64::from(domain[3] - domain[2]);
        if width <= 0.0 || height <= 0.0 || axis.determinant() == 0.0 {
            return Err(DocumentError::Invalid("function shading domain/matrix"));
        }
        let mut pixels = Vec::with_capacity(512 * 512 * 4);
        for y in 0..512 {
            for x in 0..512 {
                let values = [
                    domain[0] + (x as f32 + 0.5) / 512.0 * width as f32,
                    domain[2] + (y as f32 + 0.5) / 512.0 * height as f32,
                ]
                .into_iter()
                .collect();
                let components = function
                    .eval(&values)
                    .ok_or(DocumentError::Invalid("shading color function"))?;
                let mut color =
                    pattern
                        .shading
                        .color_space
                        .to_rgba(&components, pattern.opacity, false);
                if let Some(transfer) = &pattern.transfer_function {
                    color = transfer.apply(&color);
                }
                pixels.extend(color.premultiplied().map(|v| (v * 255.0 + 0.5) as u8));
            }
        }
        let image = (self.document.images.table.len() / 24) as u32;
        let payload = crate::raster_tiles::encode(512, 512, &pixels)?;
        if image >= 10_000
            || self.document.images.pixels.len() + payload.len() > MAX_ENCODED_IMAGE_BYTES
        {
            return Err(DocumentError::Limit("gradient image resources"));
        }
        for value in [
            512,
            512,
            self.document.images.pixels.len() as u32,
            payload.len() as u32,
            1,
            4,
        ] {
            self.document
                .images
                .table
                .extend_from_slice(&value.to_le_bytes());
        }
        self.document.images.pixels.extend_from_slice(&payload);
        self.add_instance(
            ShapeRecord {
                first: image,
                count: 0,
                from_unit: Affine::IDENTITY,
            },
            axis * Affine::translate((f64::from(domain[0]), f64::from(domain[2])))
                * Affine::scale_non_uniform(width, height),
            [1.0; 4],
            2,
        );
        Ok(())
    }
}
