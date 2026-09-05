import {
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Plane,
  Scene,
  Vector3,
  WebGLRenderer
} from 'three';
import { stylusReveal, type VirtualPointer } from './pointer-recording';

/** A transparent 3D layer with a clipped, full-length pen for each active pen pointer. */
export function createStylusScene(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, 0.1, 2000);
  camera.position.z = 600;
  scene.add(new AmbientLight(0xffffff, 2.2));
  const light = new DirectionalLight(0xffffff, 4);
  light.position.set(-200, 300, 500);
  scene.add(light);
  const pens = new Map<number, ReturnType<typeof createPen>>();

  return {
    resize(width: number, height: number, pixelRatio: number) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.right = width;
      camera.bottom = -height;
      camera.updateProjectionMatrix();
    },
    render(pointers: Map<number, VirtualPointer>, time: number, scale: number, offsetX: number, offsetY: number) {
      const visible = new Set<number>();
      for (const [id, pointer] of pointers) {
        if (pointer.sample.pointerType !== 'pen') continue;
        const reveal = stylusReveal(pointer, time);
        if (reveal < 0.001) continue;
        visible.add(id);
        let pen = pens.get(id);
        if (!pen) {
          pen = createPen();
          pens.set(id, pen);
          scene.add(pen.group);
        }
        const { sample, pose } = pointer;
        const axis = pen.axis.set(Math.tan(clampedTilt(pose.tiltX)), -Math.tan(clampedTilt(pose.tiltY)), 1).normalize();
        pen.group.position.set(offsetX + sample.x * scale, -offsetY - sample.y * scale, 0);
        pen.group.scale.setScalar(scale);
        pen.group.quaternion.setFromUnitVectors(UP, axis);
        pen.group.rotateY((-pose.twist * Math.PI) / 180);
        pen.clip.normal.copy(axis).negate();
        pen.clip.constant = axis.dot(pen.group.position) + 180 * scale * reveal;
        pen.group.visible = true;
      }
      for (const [id, pen] of pens) {
        if (visible.has(id)) continue;
        scene.remove(pen.group);
        pen.dispose();
        pens.delete(id);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      for (const pen of pens.values()) pen.dispose();
      pens.clear();
      renderer.dispose();
    }
  };
}

/** Keep the tip fixed while revealing the shaft spatially, without stretching its geometry. */
function createPen() {
  const group = new Group();
  const clip = new Plane();
  const meshes: Mesh<CylinderGeometry, MeshStandardMaterial>[] = [];
  function section(top: number, bottom: number, height: number, y: number, color: number, metalness = 0.2) {
    const mesh = new Mesh(
      new CylinderGeometry(top, bottom, height, 32),
      new MeshStandardMaterial({ color, metalness, roughness: 0.32, clippingPlanes: [clip] })
    );
    mesh.position.y = y;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
  section(4.8, 0.65, 18, 9, 0x555f61, 0.65);
  section(5.2, 4.8, 47, 41.5, 0x333c3d);
  section(5.2, 5.2, 100, 115, 0xe5e5df, 0.45);
  section(5.3, 5.3, 3, 166.5, 0x65978c, 0.65);
  section(4.6, 5.2, 12, 174, 0xa4aaa5);
  const button = section(1.7, 1.7, 15, 46, 0x8e9996, 0.6);
  button.position.z = 4.5;
  return {
    group,
    clip,
    axis: new Vector3(),
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  };
}

function clampedTilt(degrees: number) {
  return (Math.max(-89.9, Math.min(89.9, degrees)) * Math.PI) / 180;
}

const UP = new Vector3(0, 1, 0);
