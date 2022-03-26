import { BoxGeometry, BufferGeometry, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'


export default function Three() {
  const scene = new Scene();
  const camera = new PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    // ...parameters,
  });
  renderer.setSize( window.innerWidth, window.innerHeight );

  const cube = (function() {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial( { color: 0x00ff00 } );
    const cube = new Mesh( geometry, material );
    scene.add( cube );

    return cube;
  })()
  
  camera.position.z = 5;

  const controls = new OrbitControls( camera, renderer.domElement );

  {
    const material = new LineBasicMaterial( { color: 0x0000ff } );
    const points = [
      new Vector3(-10, 0, 0),
      new Vector3(0, 10, 0),
      new Vector3(10, 0, 0),
    ];

    const geometry = new BufferGeometry().setFromPoints(points);
    const line = new Line( geometry, material );
    scene.add(line);
  }

  function animate() {
    requestAnimationFrame( animate );
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render( scene, camera );
  }
  animate();

  return (<>{renderer.domElement}</>)
}