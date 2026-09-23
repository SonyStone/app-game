//! Expands PDF strokes into curved fill outlines in the stroke's original coordinate system.

use crate::error::DocumentError;
use hayro_interpret::StrokeProps;
use kurbo::{BezPath, Shape, Stroke, StrokeOpts, stroke};

/// Uses cubic offset approximations, retaining joins/caps/dashes without polygon tessellation.
pub(super) fn outline(path: &BezPath, props: &StrokeProps) -> Result<BezPath, DocumentError> {
    if path.elements().len() > 100_000 {
        return Err(DocumentError::Limit("path elements"));
    }
    if props.line_width <= 0.0 {
        return Err(DocumentError::Unsupported("device-pixel hairline strokes"));
    }

    let style = Stroke {
        width: f64::from(props.line_width),
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

    Ok(stroke(
        path.iter(),
        &style,
        &StrokeOpts::default(),
        (style.width * 0.0001).min(0.001),
    ))
}
