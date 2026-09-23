//! Converts closed path outlines to reusable, normalized, monotone cubic segments.

use crate::error::DocumentError;
use kurbo::{Affine, BezPath, CubicBez, ParamCurve, ParamCurveExtrema, PathEl, Point, Shape};

#[derive(Clone, Copy)]
pub(super) struct ShapeRecord {
    pub first: u32,
    pub count: u32,
    pub from_unit: Affine,
}

pub(super) fn append_shape(
    path: &BezPath,
    output: &mut Vec<u8>,
) -> Result<Option<ShapeRecord>, DocumentError> {
    if path.elements().len() > 100_000 {
        return Err(DocumentError::Limit("path elements"));
    }
    let bounds = path.bounding_box();
    if ![bounds.x0, bounds.y0, bounds.x1, bounds.y1]
        .iter()
        .all(|v| v.is_finite())
    {
        return Err(DocumentError::Invalid("non-finite path"));
    }
    if bounds.width() <= 0.0 || bounds.height() <= 0.0 {
        return Ok(None);
    }
    let from_unit = Affine::translate((bounds.x0, bounds.y0))
        * Affine::scale_non_uniform(bounds.width(), bounds.height());
    let to_unit = from_unit.inverse();
    let first = (output.len() / 32) as u32;
    let mut start = Point::ZERO;
    let mut current = Point::ZERO;
    let mut open = false;
    let mut append = |curve| -> Result<(), DocumentError> {
        append_curve(to_unit * curve, output)?;
        if output.len() / 32 - first as usize > 65536 {
            return Err(DocumentError::Limit("curves in a single path"));
        }
        Ok(())
    };
    for element in path.elements() {
        match *element {
            PathEl::MoveTo(p) => {
                if open && current != start {
                    append(line(current, start))?;
                }
                start = p;
                current = p;
                open = true;
            }
            PathEl::LineTo(p) => {
                append(line(current, p))?;
                current = p;
                open = true;
            }
            PathEl::QuadTo(control, p) => {
                append(CubicBez::new(
                    current,
                    current.lerp(control, 2.0 / 3.0),
                    p.lerp(control, 2.0 / 3.0),
                    p,
                ))?;
                current = p;
                open = true;
            }
            PathEl::CurveTo(a, b, p) => {
                append(CubicBez::new(current, a, b, p))?;
                current = p;
                open = true;
            }
            PathEl::ClosePath => {
                if current != start {
                    append(line(current, start))?;
                }
                current = start;
                open = false;
            }
        }
    }
    if open && current != start {
        append(line(current, start))?;
    }
    let count = (output.len() / 32) as u32 - first;
    Ok((count > 0).then_some(ShapeRecord {
        first,
        count,
        from_unit,
    }))
}

pub(super) fn append_hairline(
    curve: CubicBez,
    output: &mut Vec<u8>,
) -> Result<ShapeRecord, DocumentError> {
    let bounds = Shape::bounding_box(&curve).inflate(0.001, 0.001);
    let from_unit = Affine::translate((bounds.x0, bounds.y0))
        * Affine::scale_non_uniform(bounds.width(), bounds.height());
    let first = (output.len() / 32) as u32;
    append_curve(from_unit.inverse() * curve, output)?;
    Ok(ShapeRecord {
        first,
        count: (output.len() / 32) as u32 - first,
        from_unit,
    })
}

fn line(a: Point, b: Point) -> CubicBez {
    CubicBez::new(a, a.lerp(b, 1.0 / 3.0), a.lerp(b, 2.0 / 3.0), b)
}

fn append_curve(curve: CubicBez, output: &mut Vec<u8>) -> Result<(), DocumentError> {
    let mut cuts = curve
        .extrema()
        .into_iter()
        .filter(|t| *t > 0.0 && *t < 1.0)
        .collect::<Vec<_>>();
    cuts.sort_by(f64::total_cmp);
    cuts.dedup_by(|a, b| (*a - *b).abs() < 1.0e-10);
    cuts.push(1.0);
    let mut start = 0.0;
    for end in cuts {
        if output.len() / 32 >= 2_000_000 {
            return Err(DocumentError::Limit("curve count"));
        }
        let part = curve.subsegment(start..end);
        for p in [part.p0, part.p1, part.p2, part.p3] {
            output.extend_from_slice(&(p.x as f32).to_le_bytes());
            output.extend_from_slice(&(p.y as f32).to_le_bytes());
        }
        start = end;
    }
    Ok(())
}
