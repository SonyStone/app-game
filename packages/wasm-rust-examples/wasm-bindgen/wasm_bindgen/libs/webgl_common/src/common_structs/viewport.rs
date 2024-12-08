///
/// Defines the part of the screen/render target that the camera is projecting into.
/// All values should be in physical pixels.
///
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct Viewport {
    /// The distance in pixels from the left edge of the screen/render target.
    pub x: i32,
    /// The distance in pixels from the bottom edge of the screen/render target.
    pub y: i32,
    /// The width of the viewport.
    pub width: u32,
    /// The height of the viewport.
    pub height: u32,
}

impl Viewport {
    ///
    /// Creates a new viewport with the bottom left corner at origo `(0, 0)`.
    ///
    pub fn new_at_origo(width: u32, height: u32) -> Self {
        Self {
            x: 0,
            y: 0,
            width,
            height,
        }
    }

    ///
    /// Returns the aspect ratio of this viewport.
    ///
    pub fn aspect(&self) -> f32 {
        self.width as f32 / self.height as f32
    }

    ///
    /// Returns the intersection between this and the other Viewport.
    ///
    pub fn intersection(&self, other: impl Into<Self>) -> Self {
        let other = other.into();
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let width =
            (self.x + self.width as i32 - x).clamp(0, other.x + other.width as i32 - x) as u32;
        let height =
            (self.y + self.height as i32 - y).clamp(0, other.y + other.height as i32 - y) as u32;
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn from_canvas(canvas: &web_sys::HtmlCanvasElement) -> Self {
        Self {
            x: 0,
            y: 0,
            width: canvas.width(),
            height: canvas.height(),
        }
    }
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            width: 300,
            height: 150,
        }
    }
}
