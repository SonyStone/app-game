import { LGraph, LGraphCanvas, LiteGraph } from 'litegraph.js';
import { onMount } from 'solid-js';

export default function FirstProject() {
  const canvasEl = (<canvas width={1024} height={1024} />) as HTMLCanvasElement;

  onMount(() => {
    const graph = new LGraph();

    // debugger;

    var node_const = LiteGraph.createNode('basic/const');
    node_const.pos = [200, 200];
    graph.add(node_const);
    node_const.setValue(4.5);

    var node_watch = LiteGraph.createNode('basic/watch');
    node_watch.pos = [500, 200];
    graph.add(node_watch);

    node_const.connect(0, node_watch, 0);

    graph.start();

    const canvas = new LGraphCanvas(canvasEl, graph);
  });

  return canvasEl;
}
