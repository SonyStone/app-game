import { destroyTextureCache } from '@pixi/utils';
import { Container, Renderer, Sprite, Texture } from 'pixi.js';
import { onCleanup } from 'solid-js';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

function createApplication() {
  // const renderer = 

  const renderer = new Renderer({
    width: 640,
    height: 360,
    backgroundAlpha: 0.5,
  })
  const stage = new Container();

  return {
    stage,
    renderer,
  };
}

export default function ThreePixi() {

  // Pixi.js
  const pixi = (function () {
    const { renderer, stage } = createApplication();
    const texture = Texture.from('bunny.png');
    const sprite = new Sprite(texture);
    stage.addChild(sprite);
    
    let elapsed = 0.0;
    let id: number;
    function animate() {
      id = requestAnimationFrame( animate );
      const delta = 1;
      elapsed += delta;
      sprite.x = 100.0 + Math.cos(elapsed/50.0) * 100.0;
      renderer.render(stage);
    }
    animate();
    
    // const app = new Application({ width: 640, height: 360 });
    // console.log(`app`, app);

    onCleanup(() => {
      stage.destroy();
      renderer.destroy();
      destroyTextureCache();
      cancelAnimationFrame(id);
    })

    return renderer.view
  })();

  // Three.js

  const three = (function () {
    const scene = new Scene();
    const camera = new PerspectiveCamera( 75, 640 / 360, 0.1, 1000 );
  
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      // ...parameters,
    });
    renderer.setSize( 640, 360 );
  
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial( { color: 0x00ff00 } );
    const cube = new Mesh( geometry, material );
    scene.add( cube );
    
    camera.position.z = 5;
  
    let id: number;
    function animate() {
      id = requestAnimationFrame( animate );
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render( scene, camera );
    }
    animate();

    onCleanup(() => {
      scene.clear();
      renderer.clear();
      renderer.dispose();
      cancelAnimationFrame(id);
    })

    return renderer.domElement;
  })();

  return (<>{pixi}{three}</>)
}