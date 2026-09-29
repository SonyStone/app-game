//! Color functions are sampled once; clipping and radial circle geometry stay analytic.
//!
//! Generated ramps are content-interned, so text or many paths painted with one shading
//! share a single image resource instead of creating one per draw.
use super::{
    SceneDevice,
    geometry::ShapeRecord,
    images::{ImageCache, ResourceHeader},
};
use crate::{error::DocumentError, raster::Images};
use hayro_interpret::{
    ClipPath, Device, FillRule,
    pattern::ShadingPattern,
    shading::{ShadingFunction, ShadingType},
};
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
        match pattern.shading.shading_type.as_ref() {
            ShadingType::FunctionBased {
                domain,
                matrix,
                function,
            } => self.append_function_gradient(pattern, *domain, *matrix, function),
            ShadingType::RadialAxial { axial: false, .. } => self.append_radial_gradient(pattern),
            ShadingType::RadialAxial {
                coords,
                domain,
                function,
                extend,
                axial: true,
            } => self.append_axial_gradient(pattern, *coords, *domain, function, *extend),
            ShadingType::Dummy => Ok(()),
            _ => self.append_mesh_gradient(pattern),
        }
    }

    /// Draws an axial shading as up to three non-overlapping image quads along its axis:
    /// the extension before t = 0, a 4096-sample ramp spanning exactly t ∈ [0, 1], and the
    /// extension after t = 1. Each extension is a solid 1×1 resource (the end color when
    /// extended, otherwise the Background color or nothing). The ramp therefore keeps full
    /// resolution however short the axis is relative to the clip, and it is shared by every
    /// draw of the same shading.
    fn append_axial_gradient(
        &mut self,
        pattern: &ShadingPattern,
        coords: [f32; 6],
        domain: [f32; 2],
        function: &ShadingFunction,
        extend: [bool; 2],
    ) -> Result<(), DocumentError> {
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
        // x is the gradient parameter t; y runs across the axis.
        let bounds = axis.inverse().transform_rect_bbox(clip);
        let quad = |t0: f64, t1: f64| {
            axis * Affine::translate((t0, bounds.y0))
                * Affine::scale_non_uniform(t1 - t0, bounds.height())
        };
        let sample = |t: f32| {
            function.eval(
                &[domain[0] + t * (domain[1] - domain[0])]
                    .into_iter()
                    .collect(),
            )
        };

        let (low, high) = (bounds.x0.max(0.0), bounds.x1.min(1.0));
        if high - low > EPSILON {
            if high - low >= 1.0 / 4096.0 {
                let mut ramp = Vec::with_capacity(4096 * 4);
                for i in 0..4096 {
                    let components = sample((i as f32 + 0.5) / 4096.0)
                        .ok_or(DocumentError::Invalid("gradient color function"))?;
                    ramp.extend(shading_color(pattern, &components));
                }
                let image = self.intern_gradient(ramp_header(), &ramp)?;
                self.add_gradient_quad(image, quad(0.0, 1.0));
            } else {
                // Less than one ramp texel is visible; a solid quad avoids a huge [0, 1] quad.
                let components = sample(((low + high) * 0.5) as f32)
                    .ok_or(DocumentError::Invalid("gradient color function"))?;
                self.add_solid_quad(shading_color(pattern, &components), quad(low, high))?;
            }
        }
        for (t0, t1, extended, end) in [
            (bounds.x0, bounds.x1.min(0.0), extend[0], 0.0),
            (bounds.x0.max(1.0), bounds.x1, extend[1], 1.0),
        ] {
            if t1 - t0 <= EPSILON {
                continue;
            }
            let components = if extended {
                Some(sample(end).ok_or(DocumentError::Invalid("gradient color function"))?)
            } else {
                pattern.shading.background.clone()
            };
            if let Some(components) = components {
                self.add_solid_quad(shading_color(pattern, &components), quad(t0, t1))?;
            }
        }
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
        let mut ramp = Vec::with_capacity(4096 * 4);
        for sample in 0..4096 {
            let components = function
                .eval(
                    &[domain[0] + sample as f32 / 4095.0 * (domain[1] - domain[0])]
                        .into_iter()
                        .collect(),
                )
                .ok_or(DocumentError::Invalid("gradient color function"))?;
            ramp.extend(shading_color(pattern, &components));
        }
        let background = pattern
            .shading
            .background
            .as_ref()
            .map_or([0.0; 4], |components| {
                shading_rgba(pattern, components).premultiplied()
            });
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
        let record: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
        let radial = &self.document.radial_gradients;
        let image = self.images.intern(
            &mut self.document.images,
            ramp_header(),
            &ramp,
            "gradient image resources",
            |index| radial.get(index as usize * 64..index as usize * 64 + 64) == Some(&record[..]),
        )?;
        let start = image as usize * 64;
        if self.document.radial_gradients.len() <= start {
            self.document.radial_gradients.resize(start, 0);
            self.document.radial_gradients.extend_from_slice(&record);
        }
        self.add_gradient_quad(
            image,
            pattern.matrix
                * Affine::translate((bounds.x0, bounds.y0))
                * Affine::scale_non_uniform(bounds.width(), bounds.height()),
        );
        Ok(())
    }

    fn append_function_gradient(
        &mut self,
        pattern: &ShadingPattern,
        domain: [f32; 4],
        matrix: Affine,
        function: &ShadingFunction,
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
                pixels.extend(shading_color(pattern, &components));
            }
        }
        let payload = crate::raster_tiles::encode(512, 512, &pixels)?;
        let header = ResourceHeader {
            width: 512,
            height: 512,
            interpolate: true,
            codec: 4,
        };
        let image = self.intern_gradient(header, &payload)?;
        self.add_gradient_quad(
            image,
            axis * Affine::translate((f64::from(domain[0]), f64::from(domain[2])))
                * Affine::scale_non_uniform(width, height),
        );
        Ok(())
    }

    /// Interns a non-radial generated image; it may only share resources without RGRD geometry.
    fn intern_gradient(
        &mut self,
        header: ResourceHeader,
        payload: &[u8],
    ) -> Result<u32, DocumentError> {
        intern_plain(
            &mut self.images,
            &mut self.document.images,
            &self.document.radial_gradients,
            header,
            payload,
        )
    }

    fn add_solid_quad(&mut self, color: [u8; 4], transform: Affine) -> Result<(), DocumentError> {
        if color[3] == 0 {
            return Ok(());
        }
        let header = ResourceHeader {
            width: 1,
            height: 1,
            interpolate: false,
            codec: 0,
        };
        let image = self.intern_gradient(header, &color)?;
        self.add_gradient_quad(image, transform);
        Ok(())
    }

    fn add_gradient_quad(&mut self, image: u32, transform: Affine) {
        self.add_instance(
            ShapeRecord {
                first: image,
                count: 0,
                from_unit: Affine::IDENTITY,
            },
            transform,
            [1.0; 4],
            2,
        );
    }
}

/// Interns an image that has no radial geometry, never matching a radial resource.
pub(super) fn intern_plain(
    cache: &mut ImageCache,
    images: &mut Images,
    radial: &[u8],
    header: ResourceHeader,
    payload: &[u8],
) -> Result<u32, DocumentError> {
    cache.intern(
        images,
        header,
        payload,
        "gradient image resources",
        |index| {
            radial
                .get(index as usize * 64..index as usize * 64 + 64)
                .is_none_or(|record| record.iter().all(|b| *b == 0))
        },
    )
}

// Parameters closer than this along the axis are treated as empty extension regions.
const EPSILON: f64 = 1.0e-9;

fn ramp_header() -> ResourceHeader {
    ResourceHeader {
        width: 4096,
        height: 1,
        interpolate: true,
        codec: 0,
    }
}

fn shading_rgba(
    pattern: &ShadingPattern,
    components: &hayro_interpret::color::ColorComponents,
) -> hayro_interpret::color::AlphaColor {
    let mut color = pattern
        .shading
        .color_space
        .to_rgba(components, pattern.opacity, false);
    if let Some(transfer) = &pattern.transfer_function {
        color = transfer.apply(&color);
    }
    color
}

/// Premultiplied RGBA8 after the shading's opacity and transfer function.
fn shading_color(
    pattern: &ShadingPattern,
    components: &hayro_interpret::color::ColorComponents,
) -> [u8; 4] {
    shading_rgba(pattern, components)
        .premultiplied()
        .map(|v| (v * 255.0 + 0.5) as u8)
}
