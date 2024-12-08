pub struct Attribute<T: Sized> {
    pub data: T,
    /// name of the attribute in the shader
    pub name: String,
    /// size of the attribute in bytes
    pub size: i32,
    /// offset of the attribute in bytes
    pub offset: i32,
    /// stride of the attribute in bytes
    pub stride: i32,
}

#[test]
fn create_attribute() {
    let data: Vec<f32> = vec![0.0, 0.0, 0.0];
    let attribute = Attribute {
        data,
        name: "position".to_string(),
        size: 3,
        offset: 0,
        stride: 0,
    };

    assert_eq!(attribute.name, "position");
    assert_eq!(attribute.size, 3);
    assert_eq!(attribute.offset, 0);
    assert_eq!(attribute.stride, 0);
}
