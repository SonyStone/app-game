For camera we need

```
position vec4
matrix mat4
```

```
// to place or move an entity, you should set
transform { translation, rotation, scale } or { matrix }

// to get the global position
globalTransform


projection { PerspectiveProjection } or { OrthographicProjection }

PerspectiveProjection {
  fov: f32,
  aspect_ratio: f32,
  near: f32,
  far: f32,
}

OrthographicProjection {
  left: f32,
  right: f32,
  bottom: f32,
  top: f32,
  near: f32,
  far: f32,
  window_origin: WindowOrigin,
  scaling_mode: ScalingMode,
  scale: f32,
  depth_calculation: DepthCalculation,
}
``
```


# Animation

keyframes
easing
transformation?