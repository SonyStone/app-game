export type SVGGraphicsElementType =
  | 'svg'
  | 'circle'
  | 'line'
  | 'ellipse'
  | 'rect'
  | 'polygon'
  | 'polyline'
  | 'path'
  | 'text'
  | 'image'
  | 'g';

export type SVGNoneGraphicsElementType = 'linearGradient' | 'radialGradient' | 'stop';

type SVG = {
  component: 'svg';
  children?: SVGNode[];
} & Omit<JSX.SvgSVGAttributes<SVGSVGElement>, 'children'>;

type Line = {
  component: 'line';
  children?: SVGNode[];
} & Omit<JSX.LineSVGAttributes<SVGLineElement>, 'children'>;

type Path = {
  component: 'path';
  children?: SVGNode[];
} & Omit<JSX.PathSVGAttributes<SVGPathElement>, 'children'>;

type Group = {
  component: 'g';
  children?: SVGNode[];
} & Omit<JSX.GSVGAttributes<SVGGElement>, 'children'>;

type Circle = {
  component: 'circle';
  children?: SVGNode[];
} & Omit<JSX.CircleSVGAttributes<SVGCircleElement>, 'children'>;

type Ellipse = {
  component: 'ellipse';
  children?: SVGNode[];
} & Omit<JSX.EllipseSVGAttributes<SVGEllipseElement>, 'children'>;

type Rect = {
  component: 'rect';
  children?: SVGNode[];
} & Omit<JSX.RectSVGAttributes<SVGRectElement>, 'children'>;

type Polygon = {
  component: 'polygon';
  children?: SVGNode[];
} & Omit<JSX.PolygonSVGAttributes<SVGPolygonElement>, 'children'>;

type Polyline = {
  component: 'polyline';
  children?: SVGNode[];
} & Omit<JSX.PolylineSVGAttributes<SVGPolylineElement>, 'children'>;

type Text = {
  component: 'text';
  children?: SVGNode[];
} & Omit<JSX.TextSVGAttributes<SVGTextElement>, 'children'>;

type Image = {
  component: 'image';
  children?: SVGNode[];
} & Omit<JSX.ImageSVGAttributes<SVGImageElement>, 'children'>;

export type SVGNode = SVG | Circle | Line | Ellipse | Rect | Polygon | Polyline | Path | Text | Image | Group;
