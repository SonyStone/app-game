//! Expands PDF strokes into curved fill outlines in the stroke's original coordinate system.

use crate::error::DocumentError;
use hayro_interpret::StrokeProps;
use kurbo::{BezPath, Shape, Stroke, StrokeOpts, stroke};

/// Uses cubic offset approximations, retaining joins/caps/dashes without polygon tessellation.
///
/// # Errors
/// Rejects zero-width (device-pixel) strokes as unsupported, invalid parameters, and paths or
/// dash patterns exceeding the element/expansion budgets.
pub(super) fn outline(path: &BezPath, props: &StrokeProps) -> Result<BezPath, DocumentError> {
    check_elements(path)?;
    if props.line_width <= 0.0 {
        return Err(DocumentError::Unsupported("device-pixel hairline strokes"));
    }
    let style = style(path, props, f64::from(props.line_width))?;
    Ok(stroke(
        path.iter(),
        &style,
        &StrokeOpts::default(),
        (style.width * 0.0001).min(0.001),
    ))
}

/// Applies the same element, parameter and dash-expansion checks as [`outline`] to a
/// zero-width stroke, without computing the offset outline hairlines never use.
pub(super) fn validate_hairline(path: &BezPath, props: &StrokeProps) -> Result<(), DocumentError> {
    check_elements(path)?;
    style(path, props, 1.0).map(|_| ())
}

fn check_elements(path: &BezPath) -> Result<(), DocumentError> {
    if path.elements().len() > 100_000 {
        return Err(DocumentError::Limit("path elements"));
    }
    Ok(())
}

// Validates stroke parameters and bounds dash expansion before any dash iterator runs.
fn style(path: &BezPath, props: &StrokeProps, width: f64) -> Result<Stroke, DocumentError> {
    let style = Stroke {
        width,
        join: props.line_join,
        miter_limit: f64::from(props.miter_limit),
        start_cap: props.line_cap,
        end_cap: props.line_cap,
        dash_pattern: props.dash_array.iter().map(|v| f64::from(*v)).collect(),
        dash_offset: f64::from(props.dash_offset),
    };

    let period: f64 = style.dash_pattern.iter().sum();
    if !style.is_finite()
        || style.miter_limit <= 0.0
        || style.dash_pattern.iter().any(|length| *length < 0.0)
        || (!style.dash_pattern.is_empty() && period <= 0.0)
    {
        return Err(DocumentError::Invalid("stroke parameters"));
    }
    if !style.dash_pattern.is_empty()
        && path.perimeter(0.01) / period * style.dash_pattern.len() as f64 > 100_000.0
    {
        return Err(DocumentError::Limit("stroke dash expansion"));
    }
    Ok(style)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kurbo::{Line, Point};

    #[test]
    fn hairline_validation_matches_stroke_checks_without_building_an_outline() {
        let path = Line::new(Point::ZERO, Point::new(1000.0, 0.0)).to_path(0.1);
        let mut props = StrokeProps {
            line_width: 0.0,
            ..StrokeProps::default()
        };
        validate_hairline(&path, &props).unwrap();
        props.dash_array = [0.001, 0.001].into_iter().collect();
        assert_eq!(
            validate_hairline(&path, &props),
            Err(DocumentError::Limit("stroke dash expansion"))
        );
        props.dash_array = [-1.0, 2.0].into_iter().collect();
        assert_eq!(
            validate_hairline(&path, &props),
            Err(DocumentError::Invalid("stroke parameters"))
        );
    }
}
