#[derive(Debug, Clone)]
pub struct Camera2D {
    pub position: [f32; 2],
    pub zoom: f32,
    pub width: f32,
    pub height: f32,
    transforms: Transforms,
}

/// This structure goes straight into the webgl buffer.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct Transforms {
    pub projection_matrix: [f32; 16],
    pub view_matrix: [f32; 16],
}

impl Transforms {
    pub fn as_bytes(&self) -> &[u8] {
        unsafe { any_as_u8_slice(self) }
    }
}

impl Camera2D {
    pub fn new(width: f32, height: f32) -> Self {
        let mut camera = Self {
            position: [0.0, 0.0],
            zoom: 1.0,
            width,
            height,
            transforms: Transforms {
                projection_matrix: [0.0; 16],
                view_matrix: [0.0; 16],
            },
        };

        camera.update_projection_matrix();
        camera.update_view_matrix();

        camera
    }

    pub fn pan(&mut self, dx: f32, dy: f32) {
        self.position[0] += dx / self.zoom;
        self.position[1] += dy / self.zoom;
        self.update_view_matrix();
    }

    pub fn zoom(&mut self, delta: f32) {
        self.zoom *= 1.0 + delta * 0.001;
        self.update_view_matrix();
    }

    pub fn resize(&mut self, width: f32, height: f32) {
        self.width = width;
        self.height = height;
        self.update_projection_matrix();
    }

    #[rustfmt::skip]
    pub fn update_view_matrix(&mut self) {
        let translation = [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            -self.position[0], -self.position[1], 0.0, 1.0,
        ];

        let scale = [
            self.zoom, 0.0, 0.0, 0.0,
            0.0, self.zoom, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ];

        self.transforms.view_matrix = multiply_matrices(&translation, &scale);
    }

    #[rustfmt::skip]
    pub fn update_projection_matrix(&mut self) {
        let left = -self.width / 2.0;
        let right = self.width / 2.0;
        let bottom = -self.height / 2.0;
        let top = self.height / 2.0;

        self.transforms.projection_matrix = [
            2.0 / (right - left), 0.0, 0.0, 0.0,
            0.0, 2.0 / (top - bottom), 0.0, 0.0,
            0.0, 0.0, -1.0, 0.0,
            -(right + left) / (right - left), -(top + bottom) / (top - bottom), 0.0, 1.0,
        ];
    }

    pub fn get_transforms(&mut self) -> &Transforms {
        &self.transforms
    }
}

fn multiply_matrices(a: &[f32; 16], b: &[f32; 16]) -> [f32; 16] {
    let mut result = [0.0; 16];
    for i in 0..4 {
        for j in 0..4 {
            result[i * 4 + j] = 0.0;
            for k in 0..4 {
                result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
            }
        }
    }
    result
}

pub unsafe fn any_as_u8_slice<T: Sized>(p: &T) -> &[u8] {
    ::core::slice::from_raw_parts((p as *const T) as *const u8, ::core::mem::size_of::<T>())
}
