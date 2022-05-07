import {
  Camera,
  EventDispatcher,
  Matrix4,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Spherical,
  TOUCH,
  Vector2,
  Vector3,
} from 'three';

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

function createOrbitControls() {
  const _changeEvent = { type: 'change' };
  const _startEvent = { type: 'start' };
  const _endEvent = { type: 'end' };

  const update = function (this: OrbitControls) {
    const offset = new Vector3();

    const lastPosition = new Vector3();
    const lastQuaternion = new Quaternion();

    const twoPI = 2 * Math.PI;

    return function update(this: OrbitControls) {
      const position = this.camera.position;

      offset.copy(position).sub(this.target);

      // rotate offset to "y-axis-is-up" space
      offset.applyQuaternion(this.quat);

      // angle from z-axis around y-axis
      spherical.setFromVector3(offset);

      if (this.autoRotate && state === STATE.NONE) {
        rotateLeft(getAutoRotationAngle.bind(this)());
      }

      if (this.enableDamping) {
        spherical.theta += sphericalDelta.theta * this.dampingFactor;
        spherical.phi += sphericalDelta.phi * this.dampingFactor;
      } else {
        spherical.theta += sphericalDelta.theta;
        spherical.phi += sphericalDelta.phi;
      }

      // restrict theta to be between desired limits

      let min = this.minAzimuthAngle;
      let max = this.maxAzimuthAngle;

      if (isFinite(min) && isFinite(max)) {
        if (min < -Math.PI) min += twoPI;
        else if (min > Math.PI) min -= twoPI;

        if (max < -Math.PI) max += twoPI;
        else if (max > Math.PI) max -= twoPI;

        if (min <= max) {
          spherical.theta = Math.max(min, Math.min(max, spherical.theta));
        } else {
          spherical.theta =
            spherical.theta > (min + max) / 2
              ? Math.max(min, spherical.theta)
              : Math.min(max, spherical.theta);
        }
      }

      // restrict phi to be between desired limits
      spherical.phi = Math.max(
        this.minPolarAngle,
        Math.min(this.maxPolarAngle, spherical.phi)
      );

      spherical.makeSafe();

      spherical.radius *= scale;

      // restrict radius to be between desired limits
      spherical.radius = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, spherical.radius)
      );

      // move target to panned location

      if (this.enableDamping === true) {
        this.target.addScaledVector(panOffset, this.dampingFactor);
      } else {
        this.target.add(panOffset);
      }

      offset.setFromSpherical(spherical);

      // rotate offset back to "camera-up-vector-is-up" space
      offset.applyQuaternion(this.quatInverse);

      position.copy(this.target).add(offset);

      this.camera.lookAt(this.target);

      if (this.enableDamping === true) {
        sphericalDelta.theta *= 1 - this.dampingFactor;
        sphericalDelta.phi *= 1 - this.dampingFactor;

        panOffset.multiplyScalar(1 - this.dampingFactor);
      } else {
        sphericalDelta.set(0, 0, 0);

        panOffset.set(0, 0, 0);
      }

      scale = 1;

      // update condition is:
      // min(camera displacement, camera rotation in radians)^2 > EPS
      // using small-angle approximation cos(x/2) = 1 - x^2 / 8

      if (
        zoomChanged ||
        lastPosition.distanceToSquared(this.camera.position) > EPS ||
        8 * (1 - lastQuaternion.dot(this.camera.quaternion)) > EPS
      ) {
        this.dispatchEvent(_changeEvent);

        lastPosition.copy(this.camera.position);
        lastQuaternion.copy(this.camera.quaternion);
        zoomChanged = false;

        return true;
      }

      return false;
    };
  };

  class OrbitControls extends EventDispatcher {
    domElement!: HTMLElement;
    camera!: PerspectiveCamera | OrthographicCamera;

    // Set to false to disable this control
    enabled = true;

    // "target" sets the location of focus, where the object orbits around
    target = new Vector3();

    // How far you can dolly in and out ( PerspectiveCamera only )
    minDistance = 0;
    maxDistance = Infinity;

    // How far you can zoom in and out ( OrthographicCamera only )
    minZoom = 0;
    maxZoom = Infinity;

    // How far you can orbit vertically, upper and lower limits.
    // Range is 0 to Math.PI radians.
    minPolarAngle = 0; // radians
    maxPolarAngle = Math.PI; // radians

    // How far you can orbit horizontally, upper and lower limits.
    // If set, the interval [ min, max ] must be a sub-interval of [ - 2 PI, 2 PI ], with ( max - min < 2 PI )
    minAzimuthAngle = -Infinity; // radians
    maxAzimuthAngle = Infinity; // radians

    // Set to true to enable damping (inertia)
    // If damping is enabled, you must call controls.update() in your animation loop
    enableDamping = false;
    dampingFactor = 0.05;

    // This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
    // Set to false to disable zooming
    enableZoom = true;
    zoomSpeed = 1.0;

    // Set to false to disable rotating
    enableRotate = true;
    rotateSpeed = 1.0;

    // Set to false to disable panning
    enablePan = true;
    panSpeed = 1.0;
    screenSpacePanning = true; // if false, pan orthogonal to world-space direction camera.up
    keyPanSpeed = 7.0; // pixels moved per arrow key push

    // Set to true to automatically rotate around the target
    // If auto-rotate is enabled, you must call controls.update() in your animation loop
    autoRotate = false;
    autoRotateSpeed = 2.0; // 30 seconds per orbit when fps is 60

    // The four arrow keys
    keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp',
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown',
    };

    // Mouse buttons
    mouseButtons: { [key: string]: MOUSE } = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };

    // Touch fingers
    touches: { [key: string]: TOUCH } = {
      ONE: TOUCH.ROTATE,
      TWO: TOUCH.DOLLY_PAN,
    };

    // for reset
    target0 = this.target.clone();
    position0!: Vector3;
    zoom0!: number;

    // so camera.up is the orbit axis
    quat!: Quaternion;
    quatInverse!: Quaternion;

    // the target DOM element for key events
    _domElementKeyEvents: HTMLElement | null = null;

    update = update.bind(this)();

    constructor() {
      super();
    }

    init(domElement: HTMLElement) {
      this.domElement = domElement;
      domElement.addEventListener('contextmenu', onContextMenu.bind(this));

      domElement.addEventListener('pointerdown', onPointerDown.bind(this));
      domElement.addEventListener('pointercancel', onPointerCancel.bind(this));
      domElement.addEventListener('wheel', onMouseWheel.bind(this), {
        passive: false,
      });
    }

    setCamera(camera: PerspectiveCamera | OrthographicCamera): void {
      this.camera = camera;
      this.position0 = this.camera.position.clone();
      this.zoom0 = this.camera.zoom;

      this.quat = new Quaternion().setFromUnitVectors(
        this.camera.up,
        new Vector3(0, 1, 0)
      );
      this.quatInverse = this.quat.clone().invert();
    }

    getPolarAngle() {
      return spherical.phi;
    }

    getAzimuthalAngle() {
      return spherical.theta;
    }

    getDistance() {
      return this.camera.position.distanceTo(this.target);
    }

    listenToKeyEvents(domElement: HTMLElement) {
      domElement.addEventListener('keydown', onKeyDown.bind(this));
      this._domElementKeyEvents = domElement;
    }

    saveState() {
      this.target0.copy(this.target);
      this.position0.copy(this.camera.position);
      this.zoom0 = this.camera.zoom;
    }

    reset() {
      this.target.copy(this.target0);
      this.camera.position.copy(this.position0);
      this.camera.zoom = this.zoom0;

      this.camera.updateProjectionMatrix();
      this.dispatchEvent(_changeEvent);

      this.update();

      state = STATE.NONE;
    }

    dispose() {
      this.domElement.removeEventListener(
        'contextmenu',
        onContextMenu.bind(this)
      );

      this.domElement.removeEventListener(
        'pointerdown',
        onPointerDown.bind(this)
      );
      this.domElement.removeEventListener(
        'pointercancel',
        onPointerCancel.bind(this)
      );
      this.domElement.removeEventListener('wheel', onMouseWheel.bind(this));

      this.domElement.removeEventListener(
        'pointermove',
        onPointerMove.bind(this)
      );
      this.domElement.removeEventListener('pointerup', onPointerUp.bind(this));

      if (this._domElementKeyEvents !== null) {
        this._domElementKeyEvents.removeEventListener(
          'keydown',
          onKeyDown.bind(this)
        );
      }

      //this.dispatchEvent( { type: 'dispose' } ); // should this be added here?
    }
  }

  //
  // internals
  //

  const STATE = {
    NONE: -1,
    ROTATE: 0,
    DOLLY: 1,
    PAN: 2,
    TOUCH_ROTATE: 3,
    TOUCH_PAN: 4,
    TOUCH_DOLLY_PAN: 5,
    TOUCH_DOLLY_ROTATE: 6,
  };

  let state = STATE.NONE;

  const EPS = 0.000001;

  // current position in spherical coordinates
  const spherical = new Spherical();
  const sphericalDelta = new Spherical();

  let scale = 1;
  const panOffset = new Vector3();
  let zoomChanged = false;

  const rotateStart = new Vector2();
  const rotateEnd = new Vector2();
  const rotateDelta = new Vector2();

  const panStart = new Vector2();
  const panEnd = new Vector2();
  const panDelta = new Vector2();

  const dollyStart = new Vector2();
  const dollyEnd = new Vector2();
  const dollyDelta = new Vector2();

  const pointers: any[] = [];
  const pointerPositions: { [key: number]: Vector2 } = {};

  function getAutoRotationAngle(this: OrbitControls) {
    return ((2 * Math.PI) / 60 / 60) * this.autoRotateSpeed;
  }

  function getZoomScale(this: OrbitControls) {
    return Math.pow(0.95, this.zoomSpeed);
  }

  function rotateLeft(angle: number) {
    sphericalDelta.theta -= angle;
  }

  function rotateUp(angle: number) {
    sphericalDelta.phi -= angle;
  }

  const panLeft = (function () {
    const v = new Vector3();

    return function panLeft(distance: number, objectMatrix: Matrix4) {
      v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
      v.multiplyScalar(-distance);

      panOffset.add(v);
    };
  })();

  const panUp = (function () {
    const v = new Vector3();

    return function panUp(
      this: OrbitControls,
      distance: number,
      objectMatrix: Matrix4
    ) {
      if (this.screenSpacePanning === true) {
        v.setFromMatrixColumn(objectMatrix, 1);
      } else {
        v.setFromMatrixColumn(objectMatrix, 0);
        v.crossVectors(this.camera.up, v);
      }

      v.multiplyScalar(distance);

      panOffset.add(v);
    };
  })();

  // deltaX and deltaY are in pixels; right and down are positive
  const pan = (function () {
    const offset = new Vector3();

    return function pan(this: OrbitControls, deltaX: number, deltaY: number) {
      const element = this.domElement;

      if ((this.camera as PerspectiveCamera).isPerspectiveCamera) {
        // perspective
        const position = this.camera.position;
        offset.copy(position).sub(this.target);
        let targetDistance = offset.length();

        // half of the fov is center to top of screen
        targetDistance *= Math.tan(
          (((this.camera as PerspectiveCamera).fov / 2) * Math.PI) / 180.0
        );

        // we use only clientHeight here so aspect ratio does not distort speed
        panLeft(
          (2 * deltaX * targetDistance) / element.clientHeight,
          this.camera.matrix
        );
        panUp.bind(this)(
          (2 * deltaY * targetDistance) / element.clientHeight,
          this.camera.matrix
        );
      } else if ((this.camera as OrthographicCamera).isOrthographicCamera) {
        // orthographic
        panLeft(
          (deltaX *
            ((this.camera as OrthographicCamera).right -
              (this.camera as OrthographicCamera).left)) /
            this.camera.zoom /
            element.clientWidth,
          this.camera.matrix
        );
        panUp.bind(this)(
          (deltaY *
            ((this.camera as OrthographicCamera).top -
              (this.camera as OrthographicCamera).bottom)) /
            this.camera.zoom /
            element.clientHeight,
          this.camera.matrix
        );
      } else {
        // camera neither orthographic nor perspective
        console.warn(
          'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.'
        );
        this.enablePan = false;
      }
    };
  })();

  function dollyOut(this: OrbitControls, dollyScale: number) {
    if ((this.camera as PerspectiveCamera).isPerspectiveCamera) {
      scale /= dollyScale;
    } else if ((this.camera as OrthographicCamera).isOrthographicCamera) {
      this.camera.zoom = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.camera.zoom * dollyScale)
      );
      this.camera.updateProjectionMatrix();
      zoomChanged = true;
    } else {
      console.warn(
        'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.'
      );
      this.enableZoom = false;
    }
  }

  function dollyIn(this: OrbitControls, dollyScale: number) {
    if ((this.camera as PerspectiveCamera).isPerspectiveCamera) {
      scale *= dollyScale;
    } else if ((this.camera as OrthographicCamera).isOrthographicCamera) {
      this.camera.zoom = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.camera.zoom / dollyScale)
      );
      this.camera.updateProjectionMatrix();
      zoomChanged = true;
    } else {
      console.warn(
        'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.'
      );
      this.enableZoom = false;
    }
  }

  //
  // event callbacks - update the object state
  //

  function handleMouseDownRotate(event: MouseEvent) {
    rotateStart.set(event.clientX, event.clientY);
  }

  function handleMouseDownDolly(event: MouseEvent) {
    dollyStart.set(event.clientX, event.clientY);
  }

  function handleMouseDownPan(event: MouseEvent) {
    panStart.set(event.clientX, event.clientY);
  }

  function handleMouseMoveRotate(this: OrbitControls, event: MouseEvent) {
    rotateEnd.set(event.clientX, event.clientY);

    rotateDelta
      .subVectors(rotateEnd, rotateStart)
      .multiplyScalar(this.rotateSpeed);

    const element = this.domElement;

    rotateLeft((2 * Math.PI * rotateDelta.x) / element.clientHeight); // yes, height

    rotateUp((2 * Math.PI * rotateDelta.y) / element.clientHeight);

    rotateStart.copy(rotateEnd);

    this.update();
  }

  function handleMouseMoveDolly(this: OrbitControls, event: MouseEvent) {
    dollyEnd.set(event.clientX, event.clientY);

    dollyDelta.subVectors(dollyEnd, dollyStart);

    if (dollyDelta.y > 0) {
      dollyOut.bind(this)(getZoomScale.bind(this)());
    } else if (dollyDelta.y < 0) {
      dollyIn.bind(this)(getZoomScale.bind(this)());
    }

    dollyStart.copy(dollyEnd);

    this.update();
  }

  function handleMouseMovePan(this: OrbitControls, event: MouseEvent) {
    panEnd.set(event.clientX, event.clientY);

    panDelta.subVectors(panEnd, panStart).multiplyScalar(this.panSpeed);

    pan.bind(this)(panDelta.x, panDelta.y);

    panStart.copy(panEnd);

    this.update();
  }

  function handleMouseWheel(this: OrbitControls, event: WheelEvent) {
    if (event.deltaY < 0) {
      dollyIn.bind(this)(getZoomScale.bind(this)());
    } else if (event.deltaY > 0) {
      dollyOut.bind(this)(getZoomScale.bind(this)());
    }

    this.update();
  }

  function handleKeyDown(this: OrbitControls, event: KeyboardEvent) {
    let needsUpdate = false;

    switch (event.code) {
      case this.keys.UP:
        pan.bind(this)(0, this.keyPanSpeed);
        needsUpdate = true;
        break;

      case this.keys.BOTTOM:
        pan.bind(this)(0, -this.keyPanSpeed);
        needsUpdate = true;
        break;

      case this.keys.LEFT:
        pan.bind(this)(this.keyPanSpeed, 0);
        needsUpdate = true;
        break;

      case this.keys.RIGHT:
        pan.bind(this)(-this.keyPanSpeed, 0);
        needsUpdate = true;
        break;
    }

    if (needsUpdate) {
      // prevent the browser from scrolling on cursor keys
      event.preventDefault();

      this.update();
    }
  }

  function handleTouchStartRotate() {
    if (pointers.length === 1) {
      rotateStart.set(pointers[0].pageX, pointers[0].pageY);
    } else {
      const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
      const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);

      rotateStart.set(x, y);
    }
  }

  function handleTouchStartPan() {
    if (pointers.length === 1) {
      panStart.set(pointers[0].pageX, pointers[0].pageY);
    } else {
      const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
      const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);

      panStart.set(x, y);
    }
  }

  function handleTouchStartDolly() {
    const dx = pointers[0].pageX - pointers[1].pageX;
    const dy = pointers[0].pageY - pointers[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    dollyStart.set(0, distance);
  }

  function handleTouchStartDollyPan(this: OrbitControls) {
    if (this.enableZoom) handleTouchStartDolly();

    if (this.enablePan) handleTouchStartPan();
  }

  function handleTouchStartDollyRotate(this: OrbitControls) {
    if (this.enableZoom) handleTouchStartDolly();

    if (this.enableRotate) handleTouchStartRotate();
  }

  function handleTouchMoveRotate(this: OrbitControls, event: PointerEvent) {
    if (pointers.length == 1) {
      rotateEnd.set(event.pageX, event.pageY);
    } else {
      const position = getSecondPointerPosition(event);

      const x = 0.5 * (event.pageX + position.x);
      const y = 0.5 * (event.pageY + position.y);

      rotateEnd.set(x, y);
    }

    rotateDelta
      .subVectors(rotateEnd, rotateStart)
      .multiplyScalar(this.rotateSpeed);

    const element = this.domElement;

    rotateLeft((2 * Math.PI * rotateDelta.x) / element.clientHeight); // yes, height

    rotateUp((2 * Math.PI * rotateDelta.y) / element.clientHeight);

    rotateStart.copy(rotateEnd);
  }

  function handleTouchMovePan(this: OrbitControls, event: PointerEvent) {
    if (pointers.length === 1) {
      panEnd.set(event.pageX, event.pageY);
    } else {
      const position = getSecondPointerPosition(event);

      const x = 0.5 * (event.pageX + position.x);
      const y = 0.5 * (event.pageY + position.y);

      panEnd.set(x, y);
    }

    panDelta.subVectors(panEnd, panStart).multiplyScalar(this.panSpeed);

    pan.bind(this)(panDelta.x, panDelta.y);

    panStart.copy(panEnd);
  }

  function handleTouchMoveDolly(this: OrbitControls, event: PointerEvent) {
    const position = getSecondPointerPosition(event);

    const dx = event.pageX - position.x;
    const dy = event.pageY - position.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    dollyEnd.set(0, distance);

    dollyDelta.set(0, Math.pow(dollyEnd.y / dollyStart.y, this.zoomSpeed));

    dollyOut.bind(this)(dollyDelta.y);

    dollyStart.copy(dollyEnd);
  }

  function handleTouchMoveDollyPan(this: OrbitControls, event: PointerEvent) {
    if (this.enableZoom) handleTouchMoveDolly.bind(this)(event);

    if (this.enablePan) handleTouchMovePan.bind(this)(event);
  }

  function handleTouchMoveDollyRotate(
    this: OrbitControls,
    event: PointerEvent
  ) {
    if (this.enableZoom) handleTouchMoveDolly.bind(this)(event);

    if (this.enableRotate) handleTouchMoveRotate.bind(this)(event);
  }

  //
  // event handlers - FSM: listen for events and reset state
  //

  function onPointerDown(this: OrbitControls, event: PointerEvent) {
    if (this.enabled === false) return;

    if (pointers.length === 0) {
      this.domElement.setPointerCapture(event.pointerId);

      this.domElement.addEventListener('pointermove', onPointerMove.bind(this));
      this.domElement.addEventListener('pointerup', onPointerUp.bind(this));
    }

    //

    addPointer(event);

    if (event.pointerType === 'touch') {
      onTouchStart.bind(this)(event);
    } else {
      onMouseDown.bind(this)(event);
    }
  }

  function onPointerMove(this: OrbitControls, event: PointerEvent) {
    if (this.enabled === false) return;

    if (event.pointerType === 'touch') {
      onTouchMove.bind(this)(event);
    } else {
      onMouseMove.bind(this)(event);
    }
  }

  function onPointerUp(this: OrbitControls, event: PointerEvent) {
    removePointer(event);

    if (pointers.length === 0) {
      this.domElement.releasePointerCapture(event.pointerId);

      this.domElement.removeEventListener(
        'pointermove',
        onPointerMove.bind(this)
      );
      this.domElement.removeEventListener('pointerup', onPointerUp.bind(this));
    }

    this.dispatchEvent(_endEvent);

    state = STATE.NONE;
  }

  function onPointerCancel(this: OrbitControls, event: PointerEvent) {
    removePointer(event);
  }

  function onMouseDown(this: OrbitControls, event: MouseEvent) {
    let mouseAction;

    switch (event.button) {
      case 0:
        mouseAction = this.mouseButtons.LEFT;
        break;

      case 1:
        mouseAction = this.mouseButtons.MIDDLE;
        break;

      case 2:
        mouseAction = this.mouseButtons.RIGHT;
        break;

      default:
        mouseAction = -1;
    }

    switch (mouseAction) {
      case MOUSE.DOLLY:
        if (this.enableZoom === false) return;

        handleMouseDownDolly(event);

        state = STATE.DOLLY;

        break;

      case MOUSE.ROTATE:
        if (event.metaKey || event.shiftKey) {
          if (this.enablePan === false) return;

          handleMouseDownPan(event);

          state = STATE.PAN;
        } else if (event.ctrlKey) {
          handleMouseDownDolly(event);

          state = STATE.DOLLY;
        } else {
          if (this.enableRotate === false) return;

          handleMouseDownRotate(event);

          state = STATE.ROTATE;
        }

        break;

      case MOUSE.PAN:
        if (event.metaKey || event.shiftKey) {
          if (this.enableRotate === false) return;

          handleMouseDownRotate(event);

          state = STATE.ROTATE;
        } else {
          if (this.enablePan === false) return;

          handleMouseDownPan(event);

          state = STATE.PAN;
        }

        break;

      default:
        state = STATE.NONE;
    }

    if (state !== STATE.NONE) {
      this.dispatchEvent(_startEvent);
    }
  }

  function onMouseMove(this: OrbitControls, event: MouseEvent) {
    if (this.enabled === false) return;

    switch (state) {
      case STATE.ROTATE:
        if (this.enableRotate === false) return;

        handleMouseMoveRotate.bind(this)(event);

        break;

      case STATE.DOLLY:
        if (this.enableZoom === false) return;

        handleMouseMoveDolly.bind(this)(event);

        break;

      case STATE.PAN:
        if (this.enablePan === false) return;

        handleMouseMovePan.bind(this)(event);

        break;
    }
  }

  function onMouseWheel(this: OrbitControls, event: WheelEvent) {
    if (
      this.enabled === false ||
      this.enableZoom === false ||
      state !== STATE.NONE
    )
      return;

    event.preventDefault();

    this.dispatchEvent(_startEvent);

    handleMouseWheel.bind(this)(event);

    this.dispatchEvent(_endEvent);
  }

  function onKeyDown(this: OrbitControls, event: KeyboardEvent) {
    if (this.enabled === false || this.enablePan === false) return;

    handleKeyDown.bind(this)(event);
  }

  function onTouchStart(this: OrbitControls, event: PointerEvent) {
    trackPointer(event);

    switch (pointers.length) {
      case 1:
        switch (this.touches.ONE) {
          case TOUCH.ROTATE:
            if (this.enableRotate === false) return;

            handleTouchStartRotate();

            state = STATE.TOUCH_ROTATE;

            break;

          case TOUCH.PAN:
            if (this.enablePan === false) return;

            handleTouchStartPan();

            state = STATE.TOUCH_PAN;

            break;

          default:
            state = STATE.NONE;
        }

        break;

      case 2:
        switch (this.touches.TWO) {
          case TOUCH.DOLLY_PAN:
            if (this.enableZoom === false && this.enablePan === false) return;

            handleTouchStartDollyPan.bind(this)();

            state = STATE.TOUCH_DOLLY_PAN;

            break;

          case TOUCH.DOLLY_ROTATE:
            if (this.enableZoom === false && this.enableRotate === false)
              return;

            handleTouchStartDollyRotate.bind(this)();

            state = STATE.TOUCH_DOLLY_ROTATE;

            break;

          default:
            state = STATE.NONE;
        }

        break;

      default:
        state = STATE.NONE;
    }

    if (state !== STATE.NONE) {
      this.dispatchEvent(_startEvent);
    }
  }

  function onTouchMove(this: OrbitControls, event: PointerEvent) {
    trackPointer(event);

    switch (state) {
      case STATE.TOUCH_ROTATE:
        if (this.enableRotate === false) return;

        handleTouchMoveRotate.bind(this)(event);

        this.update();

        break;

      case STATE.TOUCH_PAN:
        if (this.enablePan === false) return;

        handleTouchMovePan.bind(this)(event);

        this.update();

        break;

      case STATE.TOUCH_DOLLY_PAN:
        if (this.enableZoom === false && this.enablePan === false) return;

        handleTouchMoveDollyPan.bind(this)(event);

        this.update();

        break;

      case STATE.TOUCH_DOLLY_ROTATE:
        if (this.enableZoom === false && this.enableRotate === false) return;

        handleTouchMoveDollyRotate.bind(this)(event);

        this.update();

        break;

      default:
        state = STATE.NONE;
    }
  }

  function onContextMenu(this: OrbitControls, event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
  }

  function addPointer(event: PointerEvent) {
    pointers.push(event);
  }

  function removePointer(event: PointerEvent) {
    delete pointerPositions[event.pointerId];

    for (let i = 0; i < pointers.length; i++) {
      if (pointers[i].pointerId == event.pointerId) {
        pointers.splice(i, 1);
        return;
      }
    }
  }

  function trackPointer(event: PointerEvent) {
    let position = pointerPositions[event.pointerId];

    if (position === undefined) {
      position = new Vector2();
      pointerPositions[event.pointerId] = position;
    }

    position.set(event.pageX, event.pageY);
  }

  function getSecondPointerPosition(event: PointerEvent) {
    const pointer =
      event.pointerId === pointers[0].pointerId ? pointers[1] : pointers[0];

    return pointerPositions[pointer.pointerId];
  }

  return OrbitControls;
}

export const OrbitControls = createOrbitControls();

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
// This is very similar to OrbitControls, another set of touch behavior
//
//    Orbit - right mouse, or left mouse + ctrl/meta/shiftKey / touch: two-finger rotate
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - left mouse, or arrow keys / touch: one-finger move

export class MapControls extends OrbitControls {
  screenSpacePanning = false; // pan orthogonal to world-space direction camera.up

  override mouseButtons = {
    LEFT: MOUSE.PAN,
    RIGHT: MOUSE.ROTATE,
  };

  touches = {
    ONE: TOUCH.PAN,
    TWO: TOUCH.DOLLY_ROTATE,
  };

  constructor() {
    super();
  }
}
