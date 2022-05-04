import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  ShapeGeometry,
} from 'three';
import { SVGLoader } from './loaders/SVGLoader';
import hexagon from './svg/hexagon.svg';

const guiData = {
  currentURL: hexagon,
  drawFillShapes: true,
  drawStrokes: true,
  fillShapesWireframe: false,
  strokesWireframe: false,
};

export function loadSVG(url: string): Promise<Group> {
  const loader = new SVGLoader();

  return new Promise((resulve) => {
    loader.load(url, function (data) {
      const paths = data.paths;

      const group = new Group();
      group.scale.multiplyScalar(0.25);
      group.position.x = -70;
      group.position.y = 70;
      group.scale.y *= -1;

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];

        const fillColor = path.userData.style.fill;
        if (
          guiData.drawFillShapes &&
          fillColor !== undefined &&
          fillColor !== 'none'
        ) {
          const material = new MeshBasicMaterial({
            color: new Color().setStyle(fillColor).convertSRGBToLinear(),
            opacity: path.userData.style.fillOpacity,
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
            wireframe: guiData.fillShapesWireframe,
          });

          const shapes = SVGLoader.createShapes(path);

          for (let j = 0; j < shapes.length; j++) {
            const shape = shapes[j];

            const geometry = new ShapeGeometry(shape);
            const mesh = new Mesh(geometry, material);

            group.add(mesh);
          }
        }

        const strokeColor = path.userData.style.stroke;

        if (
          guiData.drawStrokes &&
          strokeColor !== undefined &&
          strokeColor !== 'none'
        ) {
          const material = new MeshBasicMaterial({
            color: new Color().setStyle(strokeColor).convertSRGBToLinear(),
            opacity: path.userData.style.strokeOpacity,
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
            wireframe: guiData.strokesWireframe,
          });
          for (let j = 0, jl = path.subPaths.length; j < jl; j++) {
            const subPath = path.subPaths[j];
            const geometry = SVGLoader.pointsToStroke(
              subPath.getPoints(),
              path.userData.style
            );
            if (geometry) {
              const mesh = new Mesh(geometry, material);
              group.add(mesh);
            }
          }
        }
      }

      resulve(group);
    });
  });
}
