//! Separates disconnected fill components while keeping overlapping/nested subpaths together.

use crate::error::DocumentError;
use kurbo::{BezPath, PathEl, Rect, Shape};

/// Conservative bounds grouping preserves both winding rules, holes and translucent overlap.
pub(super) fn split(path: &BezPath) -> Result<Vec<BezPath>, DocumentError> {
    if path.elements().len() > 100_000 {
        return Err(DocumentError::Limit("path elements"));
    }

    let mut parts = Vec::<BezPath>::new();
    for element in path.elements() {
        if matches!(element, PathEl::MoveTo(_)) || parts.is_empty() {
            parts.push(BezPath::new());
        }
        if let Some(part) = parts.last_mut() {
            part.push(*element);
        }
    }

    let mut groups: Vec<(Rect, BezPath)> = Vec::new();
    parts.sort_by(|a, b| a.bounding_box().x0.total_cmp(&b.bounding_box().x0));
    let mut complete = Vec::new();
    let mut comparisons = 0usize;

    for path in parts {
        let mut bounds = path.bounding_box();
        let mut combined = path;
        let mut index = 0;

        while index < groups.len() {
            comparisons += 1;
            if comparisons > 10_000_000 {
                return Err(DocumentError::Limit("path component comparisons"));
            }

            let other = groups[index].0;
            if other.x1 < bounds.x0 {
                complete.push(groups.swap_remove(index).1);
            } else if bounds.x0 <= other.x1
                && bounds.x1 >= other.x0
                && bounds.y0 <= other.y1
                && bounds.y1 >= other.y0
            {
                let (other, path) = groups.swap_remove(index);
                bounds = bounds.union(other);
                combined.extend(path);
                // A larger union may now overlap an earlier candidate.
                index = 0;
            } else {
                index += 1;
            }
        }
        groups.push((bounds, combined));
    }

    complete.extend(groups.into_iter().map(|(_, p)| p));
    Ok(complete)
}
