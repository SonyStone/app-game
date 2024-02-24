import { Vector2d } from '../math/vector2d';

// Axis Aligned Bounding Box
export default class BoundingBox {

  constructor(options ? ) {
    options = options || {};
    this.bound.min = options.lowerBound ? Vector2d.clone(options.lowerBound) : new Vector2d();
    this.bound.max = options.upperBound ? Vector2d.clone(options.upperBound) : new Vector2d();
  }

  public bound = {
    max: < Vector2d > null,
    min: < Vector2d > null,
  };

  public static overlaps(boxA: BoundingBox, boxB: BoundingBox): boolean {
    return (
      Vector2d.isLessOrEqual(boxA.bound.min, boxB.bound.max) &&
      Vector2d.isLessOrEqual(boxB.bound.min, boxA.bound.max)
    );
  }

  public extend(box: BoundingBox) {
    let max = this.bound.max;
    let min = this.bound.min;
    if (Vector2d.isGreater(max, box.bound.max)) {
      max = box.bound.max;
    }
    if (Vector2d.isLess(min, box.bound.min)) {
      min = box.bound.min;
    }
  }

  public draw(context) {
    context.save();
    context.translate(this.bound.min.getX(), this.bound.min.getY());
    context.beginPath();
    context.rect(0, 0, this.bound.max.getX() - this.bound.min.getX(), this.bound.max.getY() - this.bound.min.getY());
    context.lineWidth = 0.5;
    context.strokeStyle = '#00ff00';
    context.stroke();
    context.restore();
  }
}
