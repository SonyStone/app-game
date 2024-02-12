import { Show, createSignal, onCleanup } from 'solid-js';
import BenchWorker from './bench?worker';

export default () => {
  const [bench, setBench] = createSignal<{ [key: string]: { op_s: string; ns_op: string } } | undefined>(undefined);
  const worker = new BenchWorker();

  worker.onmessage = (e) => {
    console.table(e.data);
    setBench(e.data);
    worker.terminate();
  };

  onCleanup(() => {
    worker.terminate();
  });

  return (
    <div>
      <h1>Piecs Performance</h1>
      <Show when={bench()} fallback={<span>Loading...</span>}>
        {(table) => (
          <table>
            <thead>
              <tr>
                <th>(index)</th>
                <th>Operations per second</th>
                <th>Nanoseconds per operation</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(table()).map(([test, result]) => (
                <tr>
                  <td>{test}</td>
                  <td>{result.op_s}</td>
                  <td>{result.ns_op}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Show>
    </div>
  );
};
