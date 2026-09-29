//! Separates disconnected fill components while keeping overlapping/nested subpaths together.

use crate::error::DocumentError;
use kurbo::{BezPath, PathEl, Rect, Shape};

/// Conservative bounds grouping preserves both winding rules, holes and translucent overlap.
///
/// Splitting is only an optimization: when the pairwise comparison budget is exhausted,
/// every subpath that is not already known to be disjoint is kept in one final component,
/// which renders identically to the unsplit path.
///
/// # Errors
/// Rejects paths with more than 100,000 elements.
pub(super) fn split(path: &BezPath) -> Result<Vec<BezPath>, DocumentError> {
    split_with_budget(path, MAX_COMPARISONS)
}

fn split_with_budget(path: &BezPath, budget: usize) -> Result<Vec<BezPath>, DocumentError> {
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

    // Bounds are computed once per subpath, not in every sort comparison.
    let mut parts: Vec<(Rect, BezPath)> = parts
        .into_iter()
        .map(|part| (part.bounding_box(), part))
        .collect();
    parts.sort_by(|a, b| a.0.x0.total_cmp(&b.0.x0));

    let mut groups: Vec<(Rect, BezPath)> = Vec::new();
    let mut complete = Vec::new();
    let mut comparisons = 0usize;
    let mut parts = parts.into_iter();

    while let Some((mut bounds, mut combined)) = parts.next() {
        let mut index = 0;
        while index < groups.len() {
            comparisons += 1;
            if comparisons > budget {
                // Everything not yet completed may still overlap; keep it as one component.
                for (_, path) in groups.drain(..).chain(parts.by_ref()) {
                    combined.extend(path);
                }
                complete.push(combined);
                return Ok(complete);
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

const MAX_COMPARISONS: usize = 10_000_000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exhausting_the_comparison_budget_keeps_remaining_subpaths_together() {
        // 20,000 vertically stacked, x-overlapping rectangles force quadratic comparisons.
        let mut path = BezPath::new();
        for i in 0..20_000 {
            let y = f64::from(i) * 2.0;
            path.extend(&Rect::new(0.0, y, 10.0, y + 1.0).to_path(0.1));
        }
        let parts = split(&path).unwrap();
        assert!(parts.len() < 20_000);
        let total: usize = parts.iter().map(|p| p.elements().len()).sum();
        assert_eq!(total, path.elements().len());

        // Without the budget cap every disjoint rectangle stays separate.
        let small: BezPath = path.elements()[..50].iter().copied().collect();
        assert_eq!(split(&small).unwrap().len(), 10);
        let capped = split_with_budget(&small, 3).unwrap();
        assert!(capped.len() < 10);
        assert_eq!(capped.iter().map(|p| p.elements().len()).sum::<usize>(), 50);
    }
}
