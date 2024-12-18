import { BoxLineGeometry } from '@packages/three/addons/geometries/box-line-geometry';
import { VRButton } from '@packages/three/addons/webxr/vr-button';
import { XRControllerModelFactory } from '@packages/three/addons/webxr/xr-controller-model-factory';
import { onCleanup } from 'solid-js';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
  XRTargetRaySpace
} from 'three';
import { OrbitControls } from '../controls/OrbitControls';

export default function webxrVRTeleport() {
  let INTERSECTION: Vector3 | undefined;
  const tempMatrix = new Matrix4();

  const scene = new Scene();
  scene.background = new Color(0x505050);

  const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10);
  camera.position.set(0, 1, 3);

  const room = new LineSegments(
    new BoxLineGeometry(6, 6, 6, 10, 10, 10).translate(0, 3, 0),
    new LineBasicMaterial({ color: 0xbcbcbc })
  );

  scene.add(room);

  scene.add(new HemisphereLight(0xa5a5a5, 0x898989, 3));

  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(1, 1, 1).normalize();
  scene.add(light);

  const marker = new Mesh(
    new CircleGeometry(0.25, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xbcbcbc })
  );
  scene.add(marker);

  const floor = new Mesh(
    new PlaneGeometry(4.8, 4.8, 2, 2).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xbcbcbc, transparent: true, opacity: 0.25 })
  );
  scene.add(floor);

  const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0x00ff00 }));
  scene.add(box);

  const raycaster = new Raycaster();

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const controls = new OrbitControls();
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;
  controls.init(renderer.domElement);
  controls.setCamera(camera);

  let baseReferenceSpace: XRReferenceSpace;
  renderer.xr.addEventListener('sessionstart', () => (baseReferenceSpace = renderer.xr.getReferenceSpace()!));
  renderer.xr.enabled = true;

  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // controllers

  function onSelectStart(this: XRTargetRaySpace) {
    this.userData.isSelecting = true;
  }

  function onSelectEnd(this: XRTargetRaySpace) {
    this.userData.isSelecting = false;

    if (INTERSECTION) {
      const offsetPosition = { x: -INTERSECTION.x, y: -INTERSECTION.y, z: -INTERSECTION.z, w: 1 };
      const offsetRotation = new Quaternion();
      const transform = new XRRigidTransform(offsetPosition, offsetRotation);
      const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace(transform);

      renderer.xr.setReferenceSpace(teleportSpaceOffset);
    }
  }

  const controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  controller1.addEventListener('connected', function (this: XRTargetRaySpace, event) {
    this.add(buildController(event.data)!);
  });
  controller1.addEventListener('disconnected', function (this: XRTargetRaySpace) {
    this.remove(this.children[0]);
  });
  scene.add(controller1);

  const controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  controller2.addEventListener('connected', function (this: XRTargetRaySpace, event) {
    this.add(buildController(event.data)!);
  });
  controller2.addEventListener('disconnected', function (this: XRTargetRaySpace) {
    this.remove(this.children[0]);
  });
  scene.add(controller2);

  // The XRControllerModelFactory will automatically fetch controller models
  // that match what the user is holding as closely as possible. The models
  // should be attached to the object returned from getControllerGrip in
  // order to match the orientation of the held device.

  const controllerModelFactory = new XRControllerModelFactory();

  const controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  const controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);

  window.addEventListener('resize', onWindowResize, false);

  function buildController(data: any): Line | Mesh | undefined {
    let geometry, material;

    switch (data.targetRayMode) {
      case 'tracked-pointer':
        geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
        geometry.setAttribute('color', new Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3));

        material = new LineBasicMaterial({ vertexColors: true, blending: AdditiveBlending });

        return new Line(geometry, material);

      case 'gaze':
        geometry = new RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
        material = new MeshBasicMaterial({ opacity: 0.5, transparent: true });
        return new Mesh(geometry, material);
    }
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  renderer.setAnimationLoop(render);

  function render() {
    INTERSECTION = undefined;

    if (controller1.userData.isSelecting === true) {
      tempMatrix.identity().extractRotation(controller1.matrixWorld);

      raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects([floor]);

      if (intersects.length > 0) {
        INTERSECTION = intersects[0].point;
      }
    } else if (controller2.userData.isSelecting === true) {
      tempMatrix.identity().extractRotation(controller2.matrixWorld);

      raycaster.ray.origin.setFromMatrixPosition(controller2.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects([floor]);

      if (intersects.length > 0) {
        INTERSECTION = intersects[0].point;
      }
    }

    if (INTERSECTION) marker.position.copy(INTERSECTION);

    marker.visible = INTERSECTION !== undefined;

    renderer.render(scene, camera);
  }

  onCleanup(() => {
    renderer.dispose();
    controls.dispose();
    scene.clear();
    controls.removeEventListener('change', render);
  });

  return renderer.domElement;
}
