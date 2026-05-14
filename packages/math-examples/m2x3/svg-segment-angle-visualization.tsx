import { Radians } from '@app-game/math/types';
import { createStruct } from '@app-game/math/utils/create-struct';
import { radToDeg } from '@app-game/math/utils/trigonometry';
import { Vec2 } from '@app-game/math/v2';
import { createMemo, mergeProps, Show } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';

// Reusable struct for calculations
const [segmentStruct] = createStruct({
  p1Start: [Vec2, Float32Array],
  p1End: [Vec2, Float32Array],
  p2Start: [Vec2, Float32Array],
  p2End: [Vec2, Float32Array],
  vec1: [Vec2, Float32Array],
  vec2: [Vec2, Float32Array],
  intersection: [Vec2, Float32Array],
  arcStart: [Vec2, Float32Array],
  arcEnd: [Vec2, Float32Array],
  normVec1: [Vec2, Float32Array],
  normVec2: [Vec2, Float32Array],
  bisectorVec: [Vec2, Float32Array]
});

/**
 * Visualizes the angle between two line segments defined by four points.
 * Calculates the intersection point to use as the angle's vertex.
 */
export function SVGSegmentAngleVisualization(props: {
  /** Start point of the first segment */
  point1Start: Vec2;
  /** End point of the first segment */
  point1End: Vec2;
  /** Start point of the second segment */
  point2Start: Vec2;
  /** End point of the second segment */
  point2End: Vec2;
  /** Radius of the angle arc */
  radius?: number;
  /** CSS class for the root <g> element */
  class?: string;
  /** Whether to show the angle measurement text */
  showMeasurement?: boolean;
  /** Stroke props for the first segment */
  segment1Props?: JSX.LineSVGAttributes<SVGLineElement>;
  /** Stroke props for the second segment */
  segment2Props?: JSX.LineSVGAttributes<SVGLineElement>;
  /** Stroke props for the angle arc */
  arcProps?: JSX.PathSVGAttributes<SVGPathElement>;
  /** Text props for the angle measurement */
  textProps?: JSX.TextSVGAttributes<SVGTextElement>;
}) {
  const defaultProps = {
    radius: 30,
    class: '',
    showMeasurement: true,
    segment1Props: { stroke: 'purple', 'stroke-width': 2 },
    segment2Props: { stroke: 'orange', 'stroke-width': 2 },
    arcProps: { stroke: 'black', fill: 'none', 'stroke-dasharray': '3 3' },
    textProps: { fill: 'black', 'font-size': '10px' }
  };

  const merged = mergeProps(defaultProps, props);

  // --- Calculations ---

  // Vectors representing the segments
  const segment1Vector = () => segmentStruct.vec1.copy(merged.point1End).sub(merged.point1Start);
  const segment2Vector = () => segmentStruct.vec2.copy(merged.point2End).sub(merged.point2Start);

  // Calculate the intersection point of the lines defined by the segments
  // Using the formula from Wikipedia: Line-line intersection
  const intersectionPoint = () => {
    const p1 = merged.point1Start;
    const p2 = merged.point1End;
    const p3 = merged.point2Start;
    const p4 = merged.point2End;

    const denominator = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);

    // Check if lines are parallel (denominator is close to zero)
    if (Math.abs(denominator) < 1e-6) {
      return undefined; // Lines are parallel or coincident
    }

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denominator;
    // const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denominator;

    // Calculate intersection point coordinates
    const intersectX = p1.x + t * (p2.x - p1.x);
    const intersectY = p1.y + t * (p2.y - p1.y);

    return segmentStruct.intersection.set(intersectX, intersectY);
  };

  // Normalized vectors pointing away from the intersection
  const normVec1 = () => segmentStruct.normVec1.copy(segment1Vector()).normalize();
  const normVec2 = () => segmentStruct.normVec2.copy(segment2Vector()).normalize();

  // Angle calculation
  const angleDetails = createMemo(() => {
    const v1 = normVec1();
    const v2 = normVec2();
    const angleRad = Vec2.angle(v1, v2);
    const angleDeg = radToDeg(angleRad as Radians);
    const displayAngleDeg = Math.abs(Math.round(angleDeg));
    const crossProduct = Vec2.crossProduct(v1, v2);
    const sweepFlag = crossProduct >= 0 ? 1 : 0;
    // For angle between lines, we usually want the smaller angle, so large-arc is 0
    const largeArcFlag = 0; // Typically visualize the smaller angle between lines

    return {
      radians: angleRad,
      degrees: angleDeg,
      displayDegrees: displayAngleDeg + 'º',
      sweepFlag: sweepFlag,
      largeArcFlag: largeArcFlag,
      isParallel: Math.abs(crossProduct) < 1e-6 // Check if vectors are parallel
    };
  });

  // Arc start and end points based on intersection and radius
  const arcStart = () => {
    const intersect = intersectionPoint();
    if (!intersect) return segmentStruct.arcStart.set(0, 0); // Default if no intersection
    return segmentStruct.arcStart.copy(normVec1()).mulScalar(merged.radius).add(intersect);
  };

  const arcEnd = () => {
    const intersect = intersectionPoint();
    if (!intersect) return segmentStruct.arcEnd.set(0, 0); // Default if no intersection
    return segmentStruct.arcEnd.copy(normVec2()).mulScalar(merged.radius).add(intersect);
  };

  // SVG path string for the arc
  const arcPath = createMemo(() => {
    const intersect = intersectionPoint();
    const details = angleDetails();
    const start = arcStart();
    const end = arcEnd();

    // Don't draw arc if lines are parallel or don't intersect
    if (!intersect || details.isParallel) {
      return '';
    }

    // Path: Move to intersection, Line to arc start, Arc to arc end, Close path
    return `M ${intersect.x},${intersect.y} L ${start.x},${start.y} A ${merged.radius} ${merged.radius} 0 ${details.largeArcFlag} ${details.sweepFlag} ${end.x},${end.y} Z`;
  });

  // Position for the angle text (roughly bisecting the angle)
  const textPosition = createMemo(() => {
    const intersect = intersectionPoint();
    if (!intersect) return { x: 0, y: 0 }; // Default

    const details = angleDetails();
    const midAngleRad = details.radians / 2;
    // Rotate normVec1 by half the angle
    const bisectorVec = segmentStruct.bisectorVec.copy(normVec1()).rotate(midAngleRad as Radians);

    // Position text slightly away from the intersection along the bisector
    const textDist = merged.radius * 0.6;
    return {
      x: intersect.x + bisectorVec.x * textDist,
      y: intersect.y + bisectorVec.y * textDist
    };
  });

  // --- Rendering ---
  return (
    <g class={merged.class}>
      {/* Draw the two segments */}
      <line
        x1={merged.point1Start.x}
        y1={merged.point1Start.y}
        x2={merged.point1End.x}
        y2={merged.point1End.y}
        {...merged.segment1Props}
      />
      <line
        x1={merged.point2Start.x}
        y1={merged.point2Start.y}
        x2={merged.point2End.x}
        y2={merged.point2End.y}
        {...merged.segment2Props}
      />

      {/* Draw the angle arc and text only if lines intersect and are not parallel */}
      <Show when={intersectionPoint() && !angleDetails().isParallel}>
        <path d={arcPath()} {...merged.arcProps} />
        <Show when={merged.showMeasurement}>
          <text
            x={textPosition().x}
            y={textPosition().y}
            text-anchor="middle"
            dominant-baseline="middle"
            class="select-none"
            {...merged.textProps}
          >
            {angleDetails().displayDegrees}
          </text>
        </Show>
      </Show>
    </g>
  );
}
