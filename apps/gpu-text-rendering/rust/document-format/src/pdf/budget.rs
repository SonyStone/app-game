//! Per-page interpretation work budget. Output-size limits alone cannot bound work that
//! produces nothing, such as empty tiling-pattern cells or overlapping mesh triangles.

use crate::error::DocumentError;

/// Remaining abstract work units for the page being interpreted.
///
/// One unit is roughly one mesh coverage sample; other operations are weighted by the
/// constants below. Exhaustion is reported as `Limit`, which the importer converts to
/// `PdfLimit` with the one-based page number.
#[derive(Clone, Copy, Debug)]
pub(super) struct WorkBudget {
    remaining: u64,
}

impl WorkBudget {
    /// A fresh budget of `units`.
    pub fn new(units: u64) -> Self {
        Self { remaining: units }
    }

    /// Whether `units` could still be charged, without charging them.
    pub fn fits(&self, units: u64) -> bool {
        units <= self.remaining
    }

    /// Consumes `units`, or empties the budget and returns `Limit(reason)`.
    pub fn charge(&mut self, units: u64, reason: &'static str) -> Result<(), DocumentError> {
        if units > self.remaining {
            self.remaining = 0;
            return Err(DocumentError::Limit(reason));
        }
        self.remaining -= units;
        Ok(())
    }
}

/// Units per page: four times the coverage samples of one full 4096² supersampled mesh.
pub(super) const PAGE_WORK: u64 = 1 << 28;

/// Units per interpreted tiling-pattern cell, approximating one small content-stream run.
pub(super) const PATTERN_CELL_WORK: u64 = 256;

/// Units per Device drawing callback (path, glyph or image), independent of its output.
pub(super) const DRAW_WORK: u64 = 16;

/// Fixed units per rasterized mesh triangle, in addition to its bounding-box samples.
pub(super) const TRIANGLE_WORK: u64 = 16;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exhaustion_is_sticky_and_reports_the_reason() {
        let mut budget = WorkBudget::new(10);
        budget.charge(4, "test").unwrap();
        assert!(budget.fits(6) && !budget.fits(7));
        assert_eq!(budget.charge(7, "test"), Err(DocumentError::Limit("test")));
        assert!(!budget.fits(1));
    }
}
