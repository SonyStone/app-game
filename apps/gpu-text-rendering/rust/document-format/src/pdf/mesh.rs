//! Mesh colors are sampled in their original color space, before transfer/opacity.
//! Only the shading is rasterized; its surrounding vector content and clip chain stay intact.

use super::{SceneDevice, geometry::ShapeRecord};
use crate::{error::DocumentError, raster::MAX_ENCODED_IMAGE_BYTES};
use hayro_interpret::{
    color::ColorComponents,
    pattern::ShadingPattern,
    shading::{ShadingFunction, ShadingType},
};
use kurbo::{Affine, Point, Rect};

impl SceneDevice<'_> {
    pub(super) fn append_mesh_gradient(
        &mut self,
        pattern: &ShadingPattern,
    ) -> Result<(), DocumentError> {
        let shading = pattern.shading.shading_type.as_ref();
        let clip = self.clips.last().copied().unwrap_or_default().bounds;
        let bounds = if pattern.shading.background.is_some()
            || matches!(shading, ShadingType::CoonsPatchMesh { .. })
        {
            clip
        } else {
            mesh_bounds(shading, pattern.matrix).intersect(clip)
        };
        if bounds.width() <= 0.0 || bounds.height() <= 0.0 {
            return Ok(());
        }
        if ![bounds.x0, bounds.y0, bounds.x1, bounds.y1]
            .into_iter()
            .all(f64::is_finite)
        {
            return Err(DocumentError::Invalid("mesh bounds"));
        }
        // 288 dpi in page space, bounded at 4096 on the longer side. Supersample
        // coverage separately to avoid seams at shared edges and translucent fringes.
        let scale = 4.0_f64.min(4096.0 / bounds.width().max(bounds.height()));
        let width = (bounds.width() * scale).ceil().max(1.0) as u32;
        let height = (bounds.height() * scale).ceil().max(1.0) as u32;
        let map = Affine::scale_non_uniform(
            f64::from(width) / bounds.width(),
            f64::from(height) / bounds.height(),
        ) * Affine::translate((-bounds.x0, -bounds.y0))
            * pattern.matrix;
        let function = match shading {
            ShadingType::TriangleMesh { function, .. }
            | ShadingType::CoonsPatchMesh { function, .. }
            | ShadingType::TensorProductPatchMesh { function, .. } => function.as_ref(),
            _ => return Err(DocumentError::Invalid("mesh shading type")),
        };
        let background = pattern
            .shading
            .background
            .as_ref()
            .map(|values| mesh_color(pattern, None, values))
            .transpose()?
            .unwrap_or([0; 4]);
        let mut raster = MeshRaster {
            width,
            height,
            samples: background.repeat(width as usize * height as usize * 4),
        };
        match shading {
            ShadingType::TriangleMesh { triangles, .. } => {
                for triangle in triangles {
                    raster.triangle(
                        [
                            map * triangle.p0.point,
                            map * triangle.p1.point,
                            map * triangle.p2.point,
                        ],
                        |weights| {
                            let values = triangle
                                .p0
                                .colors
                                .iter()
                                .zip(&triangle.p1.colors)
                                .zip(&triangle.p2.colors)
                                .map(|((&a, &b), &c)| {
                                    weights[0] as f32 * a
                                        + weights[1] as f32 * b
                                        + weights[2] as f32 * c
                                })
                                .collect();
                            mesh_color(pattern, function, &values)
                        },
                    )?;
                }
            }
            ShadingType::CoonsPatchMesh { patches, .. } => {
                for patch in patches {
                    raster.patch(
                        |p| map * patch.map_coordinate(p),
                        |p| mesh_color(pattern, function, &patch.interpolate(p)),
                    )?;
                }
            }
            ShadingType::TensorProductPatchMesh { patches, .. } => {
                for patch in patches {
                    raster.patch(
                        |p| map * patch.map_coordinate(p),
                        |p| mesh_color(pattern, function, &patch.interpolate(p)),
                    )?;
                }
            }
            _ => return Err(DocumentError::Invalid("mesh shading type")),
        }
        let pixels = raster.resolve();
        let payload = crate::raster_tiles::encode(width, height, &pixels)?;
        let images = &mut self.document.images;
        if images.table.len() / 24 >= 10_000
            || payload.len() > MAX_ENCODED_IMAGE_BYTES.saturating_sub(images.pixels.len())
        {
            return Err(DocumentError::Limit("mesh image resources"));
        }
        let image = (images.table.len() / 24) as u32;
        for value in [
            width,
            height,
            images.pixels.len() as u32,
            payload.len() as u32,
            1,
            4,
        ] {
            images.table.extend_from_slice(&value.to_le_bytes());
        }
        images.pixels.extend_from_slice(&payload);
        self.add_instance(
            ShapeRecord {
                first: image,
                count: 0,
                from_unit: Affine::IDENTITY,
            },
            Affine::translate((bounds.x0, bounds.y0))
                * Affine::scale_non_uniform(bounds.width(), bounds.height()),
            [1.0; 4],
            2,
        );
        Ok(())
    }
}

fn mesh_bounds(shading: &ShadingType, transform: Affine) -> Rect {
    let mut bounds: Option<Rect> = None;
    let mut include = |p| {
        let p = transform * p;
        bounds = Some(bounds.map_or(Rect::from_points(p, p), |b| b.union_pt(p)));
    };
    match shading {
        ShadingType::TriangleMesh { triangles, .. } => {
            for triangle in triangles {
                for p in [triangle.p0.point, triangle.p1.point, triangle.p2.point] {
                    include(p);
                }
            }
        }
        ShadingType::CoonsPatchMesh { patches, .. } => {
            for patch in patches {
                for p in patch.control_points {
                    include(p);
                }
                // Coons interiors need not stay in the boundary control-point hull.
                for y in 0..=16 {
                    for x in 0..=16 {
                        include(patch.map_coordinate(Point::new(x as f64 / 16.0, y as f64 / 16.0)));
                    }
                }
            }
        }
        ShadingType::TensorProductPatchMesh { patches, .. } => {
            for patch in patches {
                for p in patch.control_points {
                    include(p);
                }
            }
        }
        _ => {}
    }
    bounds.unwrap_or(Rect::ZERO)
}

fn mesh_color(
    pattern: &ShadingPattern,
    function: Option<&ShadingFunction>,
    values: &ColorComponents,
) -> Result<[u8; 4], DocumentError> {
    let evaluated;
    let values = if let Some(function) = function {
        evaluated = function
            .eval(values)
            .ok_or(DocumentError::Invalid("mesh color function"))?;
        &evaluated
    } else {
        values
    };
    let mut color = pattern
        .shading
        .color_space
        .to_rgba(values, pattern.opacity, false);
    if let Some(transfer) = &pattern.transfer_function {
        color = transfer.apply(&color);
    }
    Ok(color.premultiplied().map(|v| (v * 255.0 + 0.5) as u8))
}

/// Four independent subpixel samples let neighboring triangles share an edge without alpha seams.
struct MeshRaster {
    width: u32,
    height: u32,
    samples: Vec<u8>,
}

impl MeshRaster {
    fn triangle(
        &mut self,
        points: [Point; 3],
        color: impl Fn([f64; 3]) -> Result<[u8; 4], DocumentError>,
    ) -> Result<(), DocumentError> {
        let [a, b, c] = points;
        let determinant = (b - a).cross(c - a);
        if !determinant.is_finite() || determinant.abs() < 1e-12 {
            return Ok(());
        }
        let bounds = Rect::from_points(a, b).union_pt(c);
        let x0 = bounds.x0.floor().max(0.0) as u32;
        let y0 = bounds.y0.floor().max(0.0) as u32;
        let x1 = bounds.x1.ceil().min(f64::from(self.width)) as u32;
        let y1 = bounds.y1.ceil().min(f64::from(self.height)) as u32;
        for y in y0..y1 {
            for x in x0..x1 {
                for (sample, (dx, dy)) in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]
                    .into_iter()
                    .enumerate()
                {
                    let p = Point::new(f64::from(x) + dx, f64::from(y) + dy);
                    let v = (p - a).cross(c - a) / determinant;
                    let w = (b - a).cross(p - a) / determinant;
                    let u = 1.0 - v - w;
                    if u >= -1e-9 && v >= -1e-9 && w >= -1e-9 {
                        let offset =
                            ((y as usize * self.width as usize + x as usize) * 4 + sample) * 4;
                        self.samples[offset..offset + 4].copy_from_slice(&color([u, v, w])?);
                    }
                }
            }
        }
        Ok(())
    }

    fn patch(
        &mut self,
        map: impl Fn(Point) -> Point,
        color: impl Fn(Point) -> Result<[u8; 4], DocumentError>,
    ) -> Result<(), DocumentError> {
        // A uniform grid per patch avoids T junctions. Increase resolution until
        // mapped midpoints are within 1/4 output pixel of the linear cells.
        let mut steps = 8;
        while steps < 256 && patch_error(&map, steps) > 0.25 {
            steps *= 2;
        }
        for y in 0..steps {
            for x in 0..steps {
                let uv = [
                    Point::new(x as f64 / steps as f64, y as f64 / steps as f64),
                    Point::new((x + 1) as f64 / steps as f64, y as f64 / steps as f64),
                    Point::new(x as f64 / steps as f64, (y + 1) as f64 / steps as f64),
                    Point::new((x + 1) as f64 / steps as f64, (y + 1) as f64 / steps as f64),
                ];
                for indices in [[0, 1, 2], [1, 3, 2]] {
                    self.triangle(indices.map(|i| map(uv[i])), |w| {
                        color(
                            (uv[indices[0]].to_vec2() * w[0]
                                + uv[indices[1]].to_vec2() * w[1]
                                + uv[indices[2]].to_vec2() * w[2])
                                .to_point(),
                        )
                    })?;
                }
            }
        }
        Ok(())
    }

    fn resolve(self) -> Vec<u8> {
        let mut pixels = Vec::with_capacity(self.samples.len() / 4);
        for pixel in self.samples.chunks_exact(16) {
            for channel in 0..4 {
                pixels.push(
                    ((u16::from(pixel[channel])
                        + u16::from(pixel[channel + 4])
                        + u16::from(pixel[channel + 8])
                        + u16::from(pixel[channel + 12])
                        + 2)
                        / 4) as u8,
                );
            }
        }
        pixels
    }
}

fn patch_error(map: &impl Fn(Point) -> Point, steps: usize) -> f64 {
    let mut error = 0.0_f64;
    for y in 0..steps {
        for x in 0..steps {
            let at = |dx: f64, dy: f64| {
                map(Point::new(
                    (x as f64 + dx) / steps as f64,
                    (y as f64 + dy) / steps as f64,
                ))
            };
            for (actual, a, b) in [
                (at(0.5, 0.0), at(0.0, 0.0), at(1.0, 0.0)),
                (at(0.0, 0.5), at(0.0, 0.0), at(0.0, 1.0)),
                (at(0.5, 0.5), at(1.0, 0.0), at(0.0, 1.0)),
                (at(1.0, 0.5), at(1.0, 0.0), at(1.0, 1.0)),
                (at(0.5, 1.0), at(0.0, 1.0), at(1.0, 1.0)),
            ] {
                error = error.max(actual.distance(a.midpoint(b)));
            }
        }
    }
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adjacent_translucent_triangles_do_not_create_a_seam() {
        let mut raster = MeshRaster {
            width: 8,
            height: 8,
            samples: vec![0; 8 * 8 * 16],
        };
        let color = |_| Ok([128, 0, 0, 128]);
        raster
            .triangle(
                [
                    Point::new(0.0, 0.0),
                    Point::new(8.0, 0.0),
                    Point::new(0.0, 8.0),
                ],
                color,
            )
            .unwrap();
        raster
            .triangle(
                [
                    Point::new(8.0, 0.0),
                    Point::new(8.0, 8.0),
                    Point::new(0.0, 8.0),
                ],
                color,
            )
            .unwrap();
        assert!(
            raster
                .resolve()
                .chunks_exact(4)
                .all(|p| p == [128, 0, 0, 128])
        );
    }

    #[test]
    fn samples_triangle_colors_at_barycentric_coordinates() {
        let mut raster = MeshRaster {
            width: 1,
            height: 1,
            samples: vec![0; 16],
        };
        raster
            .triangle(
                [
                    Point::new(0.0, 0.0),
                    Point::new(2.0, 0.0),
                    Point::new(0.0, 2.0),
                ],
                |w| {
                    Ok([
                        (w[0] * 255.0).round() as u8,
                        (w[1] * 255.0).round() as u8,
                        (w[2] * 255.0).round() as u8,
                        255,
                    ])
                },
            )
            .unwrap();
        assert_eq!(raster.resolve(), [128, 64, 64, 255]);
    }
}
