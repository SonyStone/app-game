import { Engine, FreeCamera, HemisphericLight, Mesh, MeshBuilder, Scene, Vector3 } from 'babylonjs';
import s from './canvas.module.scss';

export default function babylonExample() {
  const canvas = (<canvas class={s.canvas}></canvas>) as HTMLCanvasElement;

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
  });

  const createScene = () => {
    const scene = new Scene(engine);
    const camera = new FreeCamera('camera1', new Vector3(0, 5, -10), scene);

    camera.setTarget(Vector3.Zero());
    camera.attachControl(canvas, false);
    const light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene);
    const sphere = MeshBuilder.CreateSphere(
      'sphere1',
      { segments: 16, diameter: 2, sideOrientation: Mesh.FRONTSIDE },
      scene
    );
    sphere.position.y = 1;
    const ground = MeshBuilder.CreateGround(
      'ground1',
      { width: 6, height: 6, subdivisions: 2, updatable: false },
      scene
    );

    return scene;
  };

  const scene = createScene();
  engine.runRenderLoop(() => {
    engine.resize();
    scene.render();
  });

  // createEventListener(
  //   window,
  //   "resize",
  //   () => {
  //     engine.resize();
  //   },
  //   { passive: true }
  // );

  return canvas;
}
